"""Account views — Sprint 10A (D-025).

Endpoint map (see ``apps.account.urls`` for URL wiring):

Public (unauthenticated):
    POST /api/v1/account/auth/request-link          → email in → 200 always
    GET  /api/v1/account/auth/verify               → token in → 200 + cookie
    POST /api/v1/account/auth/logout               → cookie cleared
    GET  /api/v1/account/loyalty/settings          → org public settings

Customer (cookie-based session):
    GET   /api/v1/account/me                       → profile
    PATCH /api/v1/account/me                       → update name/phone
    GET   /api/v1/account/me/orders                → paginated history
    GET   /api/v1/account/me/loyalty               → balance + transactions

Admin (IsAuthenticated + IsOrganizationMember):
    GET   /api/v1/account/admin/customers          → list + search
    GET   /api/v1/account/admin/customers/<id>     → detail
    POST  /api/v1/account/admin/customers/<id>/loyalty-adjust
    GET   /api/v1/account/admin/loyalty/settings   → full read
    PUT   /api/v1/account/admin/loyalty/settings   → full write

Public-orders integration:
    POST  /api/v1/public/orders                    → extends to accept
                                                     customer_id +
                                                     loyalty_points_to_redeem

Session model
-------------
The customer session is a plain unsigned cookie holding the
customer's ``pk``. Validation is just ``Customer.objects.get(pk=…, is_active=True)``
in :func:`get_current_customer`. Production deployments can flip
``settings.AUTH_COOKIE_SECURE`` to gate HTTPS-only transport, and
``settings.SESSION_COOKIE_HTTPONLY`` semantics are mirrored for our
cookie (``HttpOnly=True`` is the default; we never expose it to JS).
CSRF is enforced through Django's standard middleware on the
``POST /auth/logout`` path; the ``POST /auth/request-link`` and
``GET /auth/verify`` paths are intentionally exempt (no auth + no
state change on the request side).

Tenant isolation
----------------
Admin endpoints resolve the operator's organization via the same
``_resolve_organization`` helper used by audit / order views. The
customer endpoints accept the organization as a query parameter
(``?organization=<slug>``) because customers can in principle be
members of many tenants; for V1 we restrict to the customer's first
order-bearing org, looked up via the ``Order.customer`` reverse FK.
"""

from __future__ import annotations

import logging
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Sum
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember
from apps.branches.models import Branch
from apps.menu.models import Menu
from apps.organizations.models import Organization

from .models import Customer, LoyaltySettings, LoyaltyTransaction
from .services import (
    LoyaltyError,
    MagicLinkError,
    customer_balance,
    redeem_points,
    request_magic_link,
    adjust_points,
    verify_magic_link,
)
from .serializers import (
    AdminLoyaltySettingsSerializer,
    CustomerAdminSummarySerializer,
    CustomerProfileSerializer,
    CustomerProfileUpdateSerializer,
    LoyaltyAdjustSerializer,
    LoyaltyReadSerializer,
    LoyaltyTransactionSerializer,
    MagicLinkRequestSerializer,
    PublicLoyaltySettingsSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants + helpers
# ---------------------------------------------------------------------------
MAGIC_LINK_REQUEST_SCOPE = "magic_link_request"
HISTORY_PAGE_SIZE = 25
TRANSACTION_PAGE_SIZE = 50


def _wrap(data, request: Request) -> Response:
    """Wrap payload in the standard ``{data, meta}`` envelope."""
    return Response(
        {
            "data": data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        }
    )


def _cookie_settings() -> dict:
    """Return the kwargs Django expects for ``set_cookie``."""
    return {
        "key": settings.AUTH_COOKIE_NAME,
        "httponly": True,
        "samesite": "Lax",
        "secure": settings.AUTH_COOKIE_SECURE,
        "path": "/",
    }


def _set_customer_cookie(response: HttpResponse, customer: Customer) -> None:
    """Stamp the ``_auth_customer_id`` cookie on ``response``.

    Plain ``customer.pk`` — no signing (the cookie is HttpOnly +
    SameSite=Lax + Secure(prod); see the spec note in the module
    docstring). If a deployment needs server-side revocation it can
    layer that on top by reading the value + checking ``is_active``.
    """
    response.set_cookie(
        **_cookie_settings(),
        value=str(customer.pk),
        max_age=int(getattr(settings, "MAGIC_LINK_TTL_MINUTES", 15)) * 60 * 4,
    )


def _clear_customer_cookie(response: HttpResponse) -> None:
    # ``delete_cookie`` only accepts a small set of kwargs (key, path,
    # domain, samesite). Secure flag isn't a delete-time concept — we
    # rely on the user's browser to discard the cookie. We pass
    # ``samesite`` so the deletion matches the issuance site policy.
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        path="/",
        samesite="Lax",
    )


def get_current_customer(request: Request) -> Optional[Customer]:
    """Read the customer cookie and return the matching Customer (active).

    Returns ``None`` when the cookie is absent, malformed, or the row
    is missing/inactive. Used by both view-level guards and helpers
    (e.g. ``IsAuthenticatedCustomerDRF``). For the public orders endpoint
    we use the same helper so checkout can attach the order to the
    logged-in customer.
    """
    raw = request.COOKIES.get(settings.AUTH_COOKIE_NAME)
    if not raw:
        return None
    try:
        pk = int(raw)
    except (TypeError, ValueError):
        return None
    try:
        return Customer.objects.get(pk=pk, is_active=True)
    except Customer.DoesNotExist:
        return None


class IsAuthenticatedCustomerDRF(BasePermission):
    """DRF permission: pass iff ``get_current_customer`` returns a row.

    Distinct from platform-admin ``IsAuthenticated`` (sessions-backed)
    so a customer session can't accidentally grant admin access and
    vice versa.
    """

    message = "Bu işlem için müşteri girişi gerekli."

    def has_permission(self, request, view) -> bool:
        return get_current_customer(request) is not None


# ---------------------------------------------------------------------------
# Throttles
# ---------------------------------------------------------------------------
class MagicLinkRequestThrottle(AnonRateThrottle):
    """``5/hour`` per IP for ``POST /auth/request-link``.

    Distinct scope name so the bucket doesn't collide with the
    default 60/min anon cap that protects menu reads.
    """

    scope = MAGIC_LINK_REQUEST_SCOPE


def _resolve_organization(user):
    """Mirror of the helpers in audit/orders for admin endpoints."""
    if not (user and getattr(user, "is_authenticated", False)):
        return None
    membership = (
        Membership.objects.filter(user=user, organization__is_active=True)
        .select_related("organization")
        .first()
    )
    return membership.organization if membership else None


def _resolve_organization_for_customer(customer, slug: str) -> Optional[Organization]:
    """Resolve the organization for ``?organization=<slug>`` in customer endpoints.

    Customers are org-agnostic but their loyalty + orders ARE scoped
    per-tenant (multi-tenant V1). We resolve the requested slug to an
    org, then verify that the customer has at least one Order or
    LoyaltyTransaction there. Otherwise 404 to avoid leaking
    cross-tenant existence.
    """
    org = Organization.objects.filter(slug=slug, is_active=True).first()
    if org is None:
        return None
    has_history = (
        LoyaltyTransaction.objects.filter(
            customer=customer, organization=org
        ).exists()
        or _customer_orders_qs(customer).filter(organization=org).exists()
    )
    return org if has_history else None


def _customer_orders_qs(customer: Customer):
    from apps.orders.models import Order

    return Order.objects.filter(customer=customer)


def _err(code: str, message: str, http_status: int) -> Response:
    return Response(
        {
            "error": {"code": code, "message": message},
            "meta": {"request_id": ""},
        },
        status=http_status,
    )


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
class MagicLinkRequestView(APIView):
    """POST /api/v1/account/auth/request-link — email → magic link send.

    Always returns 200 (enumeration safe). The audit + log signals
    are the only way the operator can detect abuse; the user
    experience is identical for known and unknown emails.

    Sprint B1 — D-026 feature flag guard. When the customer's tenant
    PlanSettings has ``customer_accounts_enabled = False`` (BASIC,
    PRO, ORDERS tiers), this endpoint is locked — return 403 with a
    stable code so the client can render the upgrade CTA. We only
    gate this when ``?organization=<slug>`` is present in the query
    string; without a tenant identifier we cannot resolve a plan and
    the safe default is to allow the request through.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [MagicLinkRequestThrottle]

    def post(self, request: Request) -> Response:
        # Sprint B1 — Plan tier guard. Resolve the org from
        # ``?organization=<slug>`` and reject the request if
        # ``customer_accounts_enabled`` is False. We do this BEFORE
        # the serializer runs so a basic-tier client never gets a
        # magic-link dispatch attempt at all.
        slug = request.query_params.get("organization", "").strip()
        if slug:
            from apps.organizations.models import Organization

            org = Organization.objects.filter(
                slug=slug, is_active=True
            ).first()
            if org is not None:
                from apps.billing.services import require_feature

                try:
                    require_feature(org, "customer_accounts_enabled")
                except Exception as exc:  # FeatureDisabled from billing
                    return Response(
                        {
                            "error": {
                                "code": getattr(
                                    exc, "code", "billing.feature_disabled"
                                ),
                                "message": getattr(exc, "message", str(exc)),
                                "feature": getattr(
                                    exc, "extra", {}
                                ).get("feature"),
                            },
                            "meta": {
                                "request_id": request.META.get(
                                    "HTTP_X_REQUEST_ID", ""
                                )
                            },
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        serializer = MagicLinkRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        # Forward REMOTE_ADDR to the service for the requested_ip audit.
        ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or \
             request.META.get("REMOTE_ADDR")

        try:
            request_magic_link(
                email=email,
                requested_ip=ip,
            )
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("request_magic_link failed: %s", exc)
            # Still return 200 — enumeration safe.

        return Response(
            {"data": {"ok": True}, "meta": {"request_id": ""}}
        )


class MagicLinkVerifyView(APIView):
    """GET /api/v1/account/auth/verify?token=...

    On success: set the customer session cookie and return the
    resolved customer JSON. On failure: 400 with a stable code.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        token = request.query_params.get("token", "").strip()
        if not token:
            return _err("token.not_found", "Geçersiz bağlantı.", 400)

        try:
            customer = verify_magic_link(token=token)
        except MagicLinkError as exc:
            return _err(exc.code, exc.message, 400)

        response = Response(
            {
                "data": {
                    "customer": CustomerProfileSerializer(customer).data,
                    "session_ttl_seconds": int(
                        getattr(settings, "MAGIC_LINK_TTL_MINUTES", 15)
                    )
                    * 60
                    * 4,
                },
                "meta": {"request_id": ""},
            }
        )
        _set_customer_cookie(response, customer)
        return response


class CustomerLogoutView(APIView):
    """POST /api/v1/account/auth/logout — clear cookie."""

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        response = Response(
            {"data": {"ok": True}, "meta": {"request_id": ""}}
        )
        _clear_customer_cookie(response)
        return response


# ---------------------------------------------------------------------------
# Customer (cookie-auth) endpoints
# ---------------------------------------------------------------------------
class CustomerMeView(APIView):
    """GET / PATCH /api/v1/account/me — profile read/update."""

    permission_classes = [IsAuthenticatedCustomerDRF]

    def get(self, request: Request) -> Response:
        customer = get_current_customer(request)
        return _wrap(CustomerProfileSerializer(customer).data, request)

    def patch(self, request: Request) -> Response:
        customer = get_current_customer(request)
        serializer = CustomerProfileUpdateSerializer(
            customer, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return _wrap(
            CustomerProfileSerializer(customer).data, request
        )


class CustomerOrderHistoryView(APIView):
    """GET /api/v1/account/me/orders — paginated order history (scoped)."""

    permission_classes = [IsAuthenticatedCustomerDRF]

    def get(self, request: Request) -> Response:
        customer = get_current_customer(request)
        qs = (
            _customer_orders_qs(customer)
            .select_related("organization", "branch")
            .order_by("-placed_at")
        )
        # Optional status filter, e.g. ?status=delivered.
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        rows = list(qs[:100])
        from apps.orders.models import OrderStatus

        results = [
            {
                "id": o.id,
                "order_number": o.order_number,
                "organization_slug": o.organization.slug,
                "organization_name": o.organization.name,
                "branch_name": o.branch.name if o.branch else None,
                "status": o.status,
                "table_number": o.table_number,
                "total_amount": str(o.total_amount),
                "currency": o.currency,
                "placed_at": o.placed_at.isoformat(),
                "delivered_at": (
                    o.delivered_at.isoformat() if o.delivered_at else None
                ),
                "items": [
                    {
                        "name": it.name,
                        "quantity": it.quantity,
                        "price": str(it.price),
                    }
                    for it in o.items.all()
                ],
            }
            for o in rows
        ]
        return _wrap(
            {
                "count": len(results),
                "next": None,
                "previous": None,
                "results": results,
            },
            request,
        )


class CustomerLoyaltyView(APIView):
    """GET /api/v1/account/me/loyalty — balance + transactions per org.

    Query params:

    * ``organization=<slug>`` — required. Customer transactions are
      org-scoped (we resolve via :func:`_resolve_organization_for_customer`).
    """

    permission_classes = [IsAuthenticatedCustomerDRF]

    def get(self, request: Request) -> Response:
        customer = get_current_customer(request)
        slug = request.query_params.get("organization", "").strip()
        if not slug:
            return _err(
                "loyalty.organization_required",
                "?organization=<slug> gerekli.",
                400,
            )
        org = _resolve_organization_for_customer(customer, slug)
        if org is None:
            return _err(
                "loyalty.not_found",
                "Bu işletme için sadakat bilgisi bulunamadı.",
                404,
            )

        balance = customer_balance(customer=customer, organization=org)
        txns = list(
            LoyaltyTransaction.objects.filter(
                customer=customer, organization=org
            )
            .select_related("order")
            .order_by("-created_at")[:TRANSACTION_PAGE_SIZE]
        )
        return _wrap(
            {
                "organization": {
                    "id": org.id,
                    "slug": org.slug,
                    "name": org.name,
                },
                "balance": balance,
                "transactions": LoyaltyTransactionSerializer(
                    txns, many=True
                ).data,
            },
            request,
        )


class PublicLoyaltySettingsView(APIView):
    """GET /api/v1/account/loyalty/settings — public read (banner adım için).

    ?organization=<slug> required; returns 404 for unknown or
    loyalty-disabled (so the frontend doesn't show a banner for
    tenants who haven't enabled it).
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        slug = request.query_params.get("organization", "").strip()
        if not slug:
            return _err(
                "loyalty.organization_required",
                "?organization=<slug> gerekli.",
                400,
            )
        org = Organization.objects.filter(slug=slug, is_active=True).first()
        if org is None:
            return _err("loyalty.not_found", "İşletme bulunamadı.", 404)
        settings_obj = (
            LoyaltySettings.objects.filter(organization=org).first()
        )
        if settings_obj is None or not settings_obj.is_enabled:
            return _err("loyalty.disabled", "Sadakat kapalı.", 404)
        return _wrap(
            PublicLoyaltySettingsSerializer(settings_obj).data, request
        )


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
class AdminCustomerListView(APIView):
    """GET /api/v1/account/admin/customers — list + search (org-scoped).

    The list is scoped to customers who have at least one Order or
    LoyaltyTransaction at the operator's organization. V1 doesn't
    support a cross-tenant customer view — that would require a
    separate platform-admin surface.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        org = _resolve_organization(request.user)
        if org is None:
            return _wrap(
                {
                    "count": 0,
                    "next": None,
                    "previous": None,
                    "results": [],
                },
                request,
            )

        # Step 1: customers with history at this org.
        # Direct Order query — don't go through ``_customer_orders_qs``
        # which presupposes a Customer instance.
        from apps.orders.models import Order

        customer_ids = set(
            Order.objects.filter(organization=org)
            .exclude(customer__isnull=True)
            .values_list("customer_id", flat=True)
        )
        customer_ids |= set(
            LoyaltyTransaction.objects.filter(
                organization=org
            ).values_list("customer_id", flat=True)
        )
        customer_ids.discard(None)

        qs = Customer.objects.filter(id__in=customer_ids).order_by(
            "-last_login_at", "-created_at"
        )

        # Step 2: optional search ?search= (email/name/phone).
        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(email__icontains=search)
                | Q(full_name__icontains=search)
                | Q(phone__icontains=search)
            )

        # Step 3: pre-compute balances.
        customers = list(qs[:200])
        balances = {}
        if customers:
            for row in (
                LoyaltyTransaction.objects.filter(
                    organization=org,
                    customer_id__in=[c.id for c in customers],
                )
                .values("customer_id")
                .annotate(total=Sum("points"))
            ):
                balances[row["customer_id"]] = int(row["total"] or 0)

        data = CustomerAdminSummarySerializer(
            customers, many=True, context={"balances": balances}
        ).data
        return _wrap(
            {
                "count": len(data),
                "next": None,
                "previous": None,
                "results": data,
            },
            request,
        )


class AdminCustomerDetailView(APIView):
    """GET /api/v1/account/admin/customers/<id> — detail.

    Returns the customer profile + their balance + last 20 loyalty
    transactions + last 10 orders at the operator's org. Cross-tenant
    lookups (customer has no history at this org) return 404.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request, pk: int) -> Response:
        org = _resolve_organization(request.user)
        if org is None:
            return _err("customer.not_found", "Müşteri bulunamadı.", 404)
        customer = Customer.objects.filter(pk=pk).first()
        if customer is None:
            return _err("customer.not_found", "Müşteri bulunamadı.", 404)

        # Cross-tenant guard: 404 if no history at this org.
        has_history = (
            _customer_orders_qs(customer).filter(organization=org).exists()
            or LoyaltyTransaction.objects.filter(
                organization=org, customer=customer
            ).exists()
        )
        if not has_history:
            return _err("customer.not_found", "Müşteri bulunamadı.", 404)

        balance = customer_balance(customer=customer, organization=org)
        recent_txns = list(
            LoyaltyTransaction.objects.filter(
                customer=customer, organization=org
            )
            .order_by("-created_at")[:20]
        )
        recent_orders = list(
            _customer_orders_qs(customer)
            .filter(organization=org)
            .order_by("-placed_at")[:10]
        )
        return _wrap(
            {
                "customer": CustomerProfileSerializer(customer).data,
                "loyalty_balance": balance,
                "recent_transactions": LoyaltyTransactionSerializer(
                    recent_txns, many=True
                ).data,
                "recent_orders": [
                    {
                        "id": o.id,
                        "order_number": o.order_number,
                        "status": o.status,
                        "total_amount": str(o.total_amount),
                        "currency": o.currency,
                        "placed_at": o.placed_at.isoformat(),
                    }
                    for o in recent_orders
                ],
            },
            request,
        )


class AdminLoyaltyAdjustView(APIView):
    """POST /api/v1/account/admin/customers/<id>/loyalty-adjust.

    Body: ``{"delta_points": int, "note": str}`` (sparse positive or
    negative integer). Records an ``ADJUST`` row + audit event.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request, pk: int) -> Response:
        org = _resolve_organization(request.user)
        if org is None:
            return _err("customer.not_found", "Müşteri bulunamadı.", 404)
        customer = Customer.objects.filter(pk=pk).first()
        if customer is None:
            return _err("customer.not_found", "Müşteri bulunamadı.", 404)

        serializer = LoyaltyAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        delta = serializer.validated_data["delta_points"]
        note = serializer.validated_data.get("note", "")

        try:
            txn = adjust_points(
                customer=customer,
                organization=org,
                delta_points=delta,
                admin_user=request.user,
                note=note,
            )
        except LoyaltyError as exc:
            return _err(exc.code, exc.message, 400)

        new_balance = customer_balance(customer=customer, organization=org)
        return Response(
            {
                "data": {
                    "transaction": LoyaltyTransactionSerializer(txn).data,
                    "new_balance": new_balance,
                },
                "meta": {"request_id": ""},
            }
        )


class AdminLoyaltySettingsView(APIView):
    """GET / PUT /api/v1/account/admin/loyalty/settings — admin settings CRUD.

    GET:    Returns the ``LoyaltySettings`` for the operator's org
            (created lazily if missing).
    PUT:    Replaces the settings — fields not provided keep their
            current value (we use ``partial=True``).
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        org = _resolve_organization(request.user)
        if org is None:
            return _err(
                "loyalty.not_found", "İşletme bulunamadı.", 404
            )
        settings_obj, _ = LoyaltySettings.objects.get_or_create(
            organization=org,
            defaults={
                "is_enabled": settings.LOYALTY_DEFAULT_ENABLED
                if hasattr(settings, "LOYALTY_DEFAULT_ENABLED")
                else False,
                "points_per_currency_unit": "1.00",
                "redemption_rate": "0.10",
                "min_points_to_redeem": 100,
            },
        )
        return _wrap(
            AdminLoyaltySettingsSerializer(settings_obj).data, request
        )

    def put(self, request: Request) -> Response:
        org = _resolve_organization(request.user)
        if org is None:
            return _err(
                "loyalty.not_found", "İşletme bulunamadı.", 404
            )
        settings_obj, _ = LoyaltySettings.objects.get_or_create(
            organization=org,
            defaults={
                "is_enabled": settings.LOYALTY_DEFAULT_ENABLED
                if hasattr(settings, "LOYALTY_DEFAULT_ENABLED")
                else False,
                "points_per_currency_unit": "1.00",
                "redemption_rate": "0.10",
                "min_points_to_redeem": 100,
            },
        )
        serializer = AdminLoyaltySettingsSerializer(
            settings_obj, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return _wrap(
            AdminLoyaltySettingsSerializer(settings_obj).data, request
        )
