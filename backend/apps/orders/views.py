"""Order views — Sprint 8A (D-022).

Endpoint map (full list in module ``apps.orders.urls_public`` /
``apps.orders.urls_admin``):

Public (no auth, throttled):
    POST /api/v1/public/orders
    GET  /api/v1/public/orders/{order_number}/status

Admin (IsAuthenticated + IsOrganizationMember):
    GET  /api/v1/admin/orders                            (list + filter)
    GET  /api/v1/admin/orders/{id}                       (detail)
    POST /api/v1/admin/orders/{id}/status                (transition)
    GET  /api/v1/admin/kitchen/tickets                   (kitchen display)

Org resolution
--------------
The admin endpoints use the request user's first active membership —
same pattern as ``apps.audit.views._resolve_organization``. Platform
admins (no membership) currently see an empty list (admin tooling for
ops is V2 ileri).

Cross-tenant safety
-------------------
Every admin lookup filters by ``organization`` so user A cannot
reach user B's orders. The kitchen and detail endpoints return 404
when the lookup misses (never 403 — we don't leak existence).
"""

from __future__ import annotations

import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember
from apps.audit.services import record_event
from apps.branches.models import Branch
from apps.menu.models import Menu
from apps.organizations.models import Organization

from .models import Order, OrderStatus
from .serializers import PublicOrderCreateSerializer
from .services import create_order, transition_status

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Throttles / envelopes
# ---------------------------------------------------------------------------
class PublicOrderCreateThrottle(AnonRateThrottle):
    """20/min per IP for order placement (Sprint 8A).

    Stricter than the 60/min default anon bucket because order POSTs
    are heavier (write + audit + transaction).
    """

    scope = "public_orders"


def _wrap(data, request: Request) -> Response:
    """Wrap payload in the standard ``{data, meta}`` envelope."""
    return Response(
        {
            "data": data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        }
    )


def _resolve_organization(user):
    """Return the user's first (and usually only) active organization.

    Mirrors ``apps.audit.views._resolve_organization`` intentionally —
    keeps the "which org does this user operate as" question consistent.
    Returns ``None`` for users without an active membership.
    """
    membership = (
        Membership.objects.filter(user=user, organization__is_active=True)
        .select_related("organization")
        .first()
    )
    return membership.organization if membership else None


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------
class PublicOrderCreateView(APIView):
    """POST /api/v1/public/orders — place a customer order."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicOrderCreateThrottle]

    def post(self, request: Request) -> Response:
        serializer = PublicOrderCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {
                    "error": {
                        "code": "order.invalid_payload",
                        "message": "Doğrulama başarısız.",
                        "details": serializer.errors,
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = serializer.validated_data
        org = Organization.objects.filter(
            slug=payload["organization_slug"], is_active=True
        ).first()
        if org is None:
            return Response(
                {
                    "error": {
                        "code": "business.not_found",
                        "message": "İşletme bulunamadı veya pasif.",
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        branch = None
        if payload.get("branch_slug"):
            branch = Branch.objects.filter(
                organization=org,
                slug=payload["branch_slug"],
                is_active=True,
            ).first()
            if branch is None:
                return Response(
                    {
                        "error": {
                            "code": "branch.not_found",
                            "message": "Şube bulunamadı veya pasif.",
                        },
                        "meta": {
                            "request_id": request.META.get(
                                "HTTP_X_REQUEST_ID", ""
                            )
                        },
                    },
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Resolve the menu (best-effort). For V1 customer doesn't pin
        # a specific menu — we pick the active one for the branch /
        # org, then snapshot on OrderItem.price so this doesn't
        # actually matter for downstream renders.
        menu = (
            Menu.objects.filter(
                organization=org,
                is_active=True,
                branch=branch,
            ).first()
            or Menu.objects.filter(
                organization=org, is_active=True, branch__isnull=True
            ).first()
        )

        try:
            order = create_order(
                organization=org,
                items_data=payload["items"],
                customer_name=payload["customer_name"],
                customer_phone=payload["customer_phone"],
                branch=branch,
                menu=menu,
                table_number=payload.get("table_number", ""),
                notes=payload.get("notes", ""),
            )
        except DRFValidationError:
            raise
        except Exception as exc:
            logger.warning("Order creation failed: %s", exc)
            return Response(
                {
                    "error": {
                        "code": "order.validation_failed",
                        "message": str(exc),
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Audit: customer-side event. ``actor`` is None — these
        # requests are anonymous.
        record_event(
            organization=org,
            action="order_placed",
            target_type="order",
            target_id=order.id,
            target_repr=f"{order.order_number} ({order.customer_name})",
            payload={
                "order_number": order.order_number,
                "item_count": sum(
                    int(it["quantity"]) for it in payload["items"]
                ),
                "total_amount": str(order.total_amount),
                "currency": order.currency,
                "table_number": order.table_number,
                "branch_slug": branch.slug if branch else None,
            },
        )

        return Response(
            {
                "data": {
                    "order_number": order.order_number,
                    "status": order.status,
                    "total_amount": str(order.total_amount),
                    "currency": order.currency,
                    "placed_at": order.placed_at.isoformat(),
                },
                "meta": {
                    "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                },
            },
            status=status.HTTP_201_CREATED,
        )


class PublicOrderStatusView(APIView):
    """GET /api/v1/public/orders/{order_number}/status.

    Returns the lifecycle state + the timestamps for each milestone.
    Used by the customer-facing confirmation page that polls every
    15 s in Sprint 8B.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    def get(self, request: Request, order_number: str) -> Response:
        order = (
            Order.objects.filter(order_number=order_number)
            .select_related("organization")
            .first()
        )
        if order is None:
            return Response(
                {
                    "error": {
                        "code": "order.not_found",
                        "message": "Sipariş bulunamadı.",
                    },
                    "meta": {
                        "request_id": request.META.get("HTTP_X_REQUEST_ID", "")
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return _wrap(
            {
                "order_number": order.order_number,
                "status": order.status,
                "placed_at": order.placed_at.isoformat(),
                "confirmed_at": (
                    order.confirmed_at.isoformat() if order.confirmed_at else None
                ),
                "preparing_at": (
                    order.preparing_at.isoformat() if order.preparing_at else None
                ),
                "ready_at": order.ready_at.isoformat() if order.ready_at else None,
                "delivered_at": (
                    order.delivered_at.isoformat() if order.delivered_at else None
                ),
                "cancelled_at": (
                    order.cancelled_at.isoformat() if order.cancelled_at else None
                ),
            },
            request,
        )


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------
class AdminOrdersView(APIView):
    """GET /api/v1/admin/orders — list orders for the active org."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _wrap(
                {
                    "count": 0,
                    "next": None,
                    "previous": None,
                    "results": [],
                },
                request,
            )

        qs = (
            Order.objects.filter(organization=organization)
            .select_related("branch")
            .order_by("-placed_at")
        )

        status_filter = request.query_params.get("status")
        if status_filter:
            valid = {choice for choice, _ in OrderStatus.choices}
            if status_filter not in valid:
                return Response(
                    {
                        "error": {
                            "code": "order.invalid_status",
                            "message": f"status şunlardan biri olmalı: "
                                       f"{sorted(valid)}.",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs = qs.filter(status=status_filter)

        date_filter = request.query_params.get("date")
        if date_filter:
            qs = qs.filter(placed_at__date=date_filter)

        # Soft cap — dashboard wants the most recent 100.
        orders = list(qs[:100])
        results = [
            {
                "id": o.id,
                "order_number": o.order_number,
                "status": o.status,
                "table_number": o.table_number,
                "customer_name": o.customer_name,
                "customer_phone": o.customer_phone,
                "total_amount": str(o.total_amount),
                "currency": o.currency,
                "item_count": o.items.count(),
                "branch_name": o.branch.name if o.branch else None,
                "placed_at": o.placed_at.isoformat(),
            }
            for o in orders
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


class AdminOrderDetailView(APIView):
    """GET /api/v1/admin/orders/{id} — full order + items."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {
                    "error": {
                        "code": "order.not_found",
                        "message": "Sipariş bulunamadı.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        order = (
            Order.objects.filter(organization=organization, pk=pk)
            .select_related("branch", "menu")
            .prefetch_related("items")
            .first()
        )
        if order is None:
            return Response(
                {
                    "error": {
                        "code": "order.not_found",
                        "message": "Sipariş bulunamadı.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        items = [
            {
                "id": item.id,
                "menu_item": item.menu_item_id,
                "name": item.name,
                "price": str(item.price),
                "quantity": item.quantity,
                "notes": item.notes,
            }
            for item in order.items.all()
        ]
        return _wrap(
            {
                "id": order.id,
                "order_number": order.order_number,
                "status": order.status,
                "table_number": order.table_number,
                "customer_name": order.customer_name,
                "customer_phone": order.customer_phone,
                "notes": order.notes,
                "total_amount": str(order.total_amount),
                "currency": order.currency,
                "branch_name": order.branch.name if order.branch else None,
                "items": items,
                "placed_at": order.placed_at.isoformat(),
                "confirmed_at": (
                    order.confirmed_at.isoformat() if order.confirmed_at else None
                ),
                "preparing_at": (
                    order.preparing_at.isoformat() if order.preparing_at else None
                ),
                "ready_at": order.ready_at.isoformat() if order.ready_at else None,
                "delivered_at": (
                    order.delivered_at.isoformat() if order.delivered_at else None
                ),
                "cancelled_at": (
                    order.cancelled_at.isoformat() if order.cancelled_at else None
                ),
            },
            request,
        )


class AdminOrderStatusView(APIView):
    """POST /api/v1/admin/orders/{id}/status — state machine update."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request, pk: int) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {
                    "error": {
                        "code": "order.not_found",
                        "message": "Sipariş bulunamadı.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        order = Order.objects.filter(
            organization=organization, pk=pk
        ).first()
        if order is None:
            return Response(
                {
                    "error": {
                        "code": "order.not_found",
                        "message": "Sipariş bulunamadı.",
                    }
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        new_status = request.data.get("status")
        if not new_status:
            return Response(
                {
                    "error": {
                        "code": "order.status_required",
                        "message": "status alanı zorunludur.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            transition_status(order, new_status, actor=request.user)
        except Exception as exc:
            return Response(
                {
                    "error": {
                        "code": "order.invalid_transition",
                        "message": str(exc),
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return _wrap(
            {
                "order_number": order.order_number,
                "status": order.status,
                "placed_at": order.placed_at.isoformat(),
                "confirmed_at": (
                    order.confirmed_at.isoformat() if order.confirmed_at else None
                ),
                "preparing_at": (
                    order.preparing_at.isoformat() if order.preparing_at else None
                ),
                "ready_at": order.ready_at.isoformat() if order.ready_at else None,
                "delivered_at": (
                    order.delivered_at.isoformat() if order.delivered_at else None
                ),
                "cancelled_at": (
                    order.cancelled_at.isoformat() if order.cancelled_at else None
                ),
            },
            request,
        )


# Default statuses when the kitchen view is called without an explicit
# filter. Delivered/cancelled rows are intentionally hidden so the
# active tickets stay readable.
_KITCHEN_DEFAULT_STATUSES = "pending,confirmed,preparing"


class KitchenTicketsView(APIView):
    """GET /api/v1/admin/kitchen/tickets — kitchen display feed.

    Query params:

    * ``status`` — comma-separated list of statuses to include. Default
      ``pending,confirmed,preparing`` (delivered/cancelled hidden).
      Pass ``all`` to include every status.

    Returns a flat list ready for ticket-card rendering (one card per
    order, items embedded). Sorted ``placed_at`` ASC so the oldest
    active ticket is at the top.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return _wrap([], request)

        status_filter = request.query_params.get(
            "status", _KITCHEN_DEFAULT_STATUSES
        )
        if status_filter == "all":
            statuses = {choice for choice, _ in OrderStatus.choices}
        else:
            requested = {
                s.strip() for s in status_filter.split(",") if s.strip()
            }
            valid = {choice for choice, _ in OrderStatus.choices}
            unknown = requested - valid
            if unknown:
                return Response(
                    {
                        "error": {
                            "code": "order.invalid_status",
                            "message": f"Bilinmeyen status: {sorted(unknown)}.",
                        }
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            statuses = requested

        tickets = list(
            Order.objects.filter(
                organization=organization, status__in=statuses
            )
            .select_related("branch", "menu")
            .prefetch_related("items")
            .order_by("placed_at")
        )
        now = timezone.now()

        payload = []
        for order in tickets:
            payload.append(
                {
                    "id": order.id,
                    "order_number": order.order_number,
                    "status": order.status,
                    "table_number": order.table_number,
                    "branch_name": (
                        order.branch.name if order.branch else None
                    ),
                    "customer_name": order.customer_name,
                    "customer_phone": order.customer_phone,
                    "time_since_placed_seconds": int(
                        (now - order.placed_at).total_seconds()
                    ),
                    "items": [
                        {
                            "id": item.id,
                            "name": item.name,
                            "price": str(item.price),
                            "quantity": item.quantity,
                            "notes": item.notes,
                        }
                        for item in order.items.all()
                    ],
                    "placed_at": order.placed_at.isoformat(),
                }
            )
        return _wrap(payload, request)
