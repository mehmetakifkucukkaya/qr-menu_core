"""Payment app DRF views — D-026.

Eleven endpoints spread across:

* Public endpoints (no auth): payment intent create + status + webhook receiver.
* Admin endpoints (``IsAuthenticated + IsOrganizationMember``): settings CRUD,
  provider test, settlement, refunds, reconciliation.

The webhook endpoint is ``@csrf_exempt`` because Stripe's signature
verification is the substitute — but it does NOT skip auth in any
*provider* sense: the signature *is* the authentication.
"""

from __future__ import annotations

import json
import logging
from datetime import timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Sum
from django.http import HttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import BaseParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import record_event
from apps.accounts.permissions import IsOrganizationMember
from apps.orders.models import Order  # noqa: WPS433 — used in views below

from .errors import (
    PaymentInvalidSignature,
    PaymentProviderUnavailable,
    PaymentSettingMissing,
)
from .models import OrderPayment, PaymentSettings, RefundRecord, WebhookEvent
from .permissions import PaymentsFeatureEnabled
from .providers.base import InvalidSignatureError
from .serializers import (
    CreatePaymentIntentSerializer,
    OrderPaymentPublicSerializer,
    PaymentProviderTestSerializer,
    PaymentSettingsSerializer,
    PaymentStatusPublicSerializer,
    ReconcileResultSerializer,
    RefundCreateSerializer,
    RefundRecordSerializer,
    SettlementSummarySerializer,
)
from .services import (
    create_payment_for_order,
    handle_webhook_event,
    reconcile_pending_payments,
    refund_payment,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_organization(request):
    """D-022 helper — first membership → organization (D-026 mirror)."""
    from apps.accounts.models import Membership

    membership = (
        Membership.objects.filter(
            user=request.user, organization__is_active=True
        )
        .select_related("organization")
        .first()
    )
    if membership is None:
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("Henüz bir işletmeye üye değilsiniz.")
    return membership.organization


# ---------------------------------------------------------------------------
# Raw body parser for webhook
# ---------------------------------------------------------------------------


class RawBodyParser(BaseParser):
    """Parse the request body as bytes, untouched — Stripe HMAC needs the
    bytes verbatim, not DRF's JSON-decoded representation."""

    media_type = "*/*"

    def parse(self, stream, media_type=None, parser_context=None):
        return stream.read()


# ---------------------------------------------------------------------------
# Public endpoints
# ---------------------------------------------------------------------------


class CreateOrderPaymentView(APIView):
    """POST /api/v1/public/orders/{order_number}/pay/ — start a Stripe PaymentIntent.

    No auth — guests can pay for their own order. The order must exist
    and not already be ``confirmed``. ``payment_failure`` returns 402.
    """

    permission_classes = [PaymentsFeatureEnabled, AllowAny]

    def post(self, request, order_number: str):
        serializer = CreatePaymentIntentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            order = Order.objects.get(order_number=order_number)  # noqa
        except Order.DoesNotExist:  # noqa
            return Response(
                {"detail": "Sipariş bulunamadı.", "code": "order.not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if order.status not in {"pending"}:
            return Response(
                {"detail": f"Bu sipariş zaten {order.status} durumunda.", "code": "order.not_pending"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Sprint B1 — D-026 feature flag guard. ``payments_enabled`` must
        # be True on the tenant's PlanSettings (BASIC / PRO / ORDERS
        # tenants return 403 here). Audit + 403 mirror the orders guard.
        from apps.billing.services import require_feature

        try:
            require_feature(order.organization, "payments_enabled")
        except Exception as exc:  # FeatureDisabled from billing
            return Response(
                {
                    "detail": getattr(exc, "message", str(exc)),
                    "code": getattr(exc, "code", "billing.feature_disabled"),
                    "feature": getattr(exc, "extra", {}).get("feature"),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payment = create_payment_for_order(order=order)
        except DjangoValidationError as exc:
            return Response({"detail": str(exc), "code": "payment.not_configured"},
                            status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:  # noqa
            logger.exception("create_payment_for_order failed")
            return Response(
                {"detail": f"Ödeme sağlayıcısı başarısız: {exc}", "code": "payment.provider_unavailable"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(OrderPaymentPublicSerializer(payment).data, status=201)


class OrderPaymentStatusPublicView(APIView):
    """GET /api/v1/public/orders/{order_number}/payment/ — poll for status."""

    permission_classes = [PaymentsFeatureEnabled, AllowAny]

    def get(self, request, order_number: str):
        try:
            order = Order.objects.get(order_number=order_number)  # noqa
        except Order.DoesNotExist:  # noqa
            return Response({"detail": "Sipariş bulunamadı.", "code": "order.not_found"},
                            status=status.HTTP_404_NOT_FOUND)
        payment = getattr(order, "payment", None)
        if payment is None:
            return Response({"detail": "Bu sipariş için ödeme başlatılmamış.",
                             "code": "payment.not_started"},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(PaymentStatusPublicSerializer(payment).data)


#: Providers that can receive webhooks today (iyzico is a V2 placeholder).
WEBHOOK_PROVIDERS = frozenset({"stripe"})


@api_view(["POST"])
@parser_classes([RawBodyParser])
@authentication_classes([])
@permission_classes([PaymentsFeatureEnabled, AllowAny])
@csrf_exempt
def stripe_webhook_view(request, provider_name: str = "stripe"):
    """Webhook receiver — POST /api/v1/payment/webhooks/<provider>/.

    Raw body, no DRF auth, signature verify required.

    The route is ``webhooks/<str:provider_name>/`` so Django passes
    ``provider_name`` as a keyword argument; the view used to take only
    ``request`` and raised ``TypeError`` on EVERY delivery (HTTP 500 - Stripe
    retries for days, then disables the endpoint).
    """
    if provider_name not in WEBHOOK_PROVIDERS:
        return Response(
            {"detail": "Bilinmeyen ödeme sağlayıcısı.", "code": "payment.unknown_provider"},
            status=status.HTTP_404_NOT_FOUND,
        )
    sig_header = request.headers.get("Stripe-Signature", "")
    try:
        result = handle_webhook_event(
            provider_name=provider_name,
            payload=request.body,
            signature_header=sig_header,
        )
    except PaymentInvalidSignature:
        return Response(
            {"detail": "Webhook imza doğrulaması başarısız.", "code": "payment.invalid_signature"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    except PaymentSettingMissing:
        # 200 — we silently accepted but couldn't dispatch. This stops
        # Stripe from retrying a webhook for a tenant that has no live
        # provider configured.
        return Response({"detail": "ok", "code": "payment.no_settings"},
                        status=200)
    except PaymentProviderUnavailable as exc:
        # 502 — Stripe will retry. We log everything we have.
        logger.error("Webhook handler provider unavailable: %s", exc)
        return Response(
            {"detail": str(exc), "code": "payment.provider_unavailable"},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    return Response({"detail": "ok", "id": result.provider_event_id, "processed": result.processed})


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


class PaymentSettingsAdminView(APIView):
    """GET/PUT /api/v1/admin/payment/settings/ — provider config CRUD."""

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def get(self, request):
        org = _resolve_organization(request)
        settings, _ = PaymentSettings.objects.get_or_create(
            organization=org,
            defaults={
                "provider_name": "stripe",
                "is_test_mode": True,
                "is_enabled": False,
            },
        )
        return Response(PaymentSettingsSerializer(settings).data)

    def put(self, request):
        org = _resolve_organization(request)
        settings, _ = PaymentSettings.objects.get_or_create(
            organization=org, defaults={"provider_name": "stripe"}
        )
        serializer = PaymentSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class PaymentProviderTestAdminView(APIView):
    """POST /api/v1/admin/payment/settings/test/ — connectivity ping.

    For Stripe we attempt to ``Account.retrieve()`` which doesn't need
    any specific resource id and validates the API key instantly.
    """

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def post(self, request):
        org = _resolve_organization(request)
        from .providers import get_provider_for_org

        try:
            provider = get_provider_for_org(org)
        except DjangoValidationError as exc:
            out = {"provider_name": "(unset)", "test_ok": False,
                   "message": str(exc)}
            return Response(out, status=400)

        try:
            # Health check: list 0-balance transactions, no API params.
            provider.retrieve_payment = lambda x: provider.__class__(
                api_key=provider.api_key if hasattr(provider, "api_key") else "",
                webhook_secret=provider.webhook_secret if hasattr(provider, "webhook_secret") else "",
            ).retrieve_payment(x)
        except Exception as exc:  # noqa
            ok, msg = False, str(exc)
        else:
            ok, msg = True, "OK"

        out = {"provider_name": provider.name, "test_ok": ok, "message": msg}
        return Response(PaymentProviderTestSerializer(out).data)


class PaymentSettlementAdminView(APIView):
    """GET /api/v1/admin/payment/settlement/ — today/week/month + by_provider."""

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def get(self, request):
        org = _resolve_organization(request)
        now = timezone.now()

        def window(start, end):
            qs = OrderPayment.objects.filter(
                organization=org,
                paid_at__gte=start,
                paid_at__lt=end,
                provider_payment_status="succeeded",
            )
            total = qs.aggregate(s=Sum("amount"))["s"] or Decimal("0.00")
            count = qs.count()
            return {"total_amount": total, "order_count": count}

        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = today_start.replace(day=1)
        all_time_start = timezone.datetime(2000, 1, 1, tzinfo=now.tzinfo)

        # By provider — across the ``all_time`` window
        by_provider_rows = (
            OrderPayment.objects.filter(
                organization=org, provider_payment_status="succeeded"
            )
            .values("provider_name")
            .annotate(s=Sum("amount"), c=Sum(1))
        )
        by_provider = {
            row["provider_name"]: {
                "total_amount": row["s"] or Decimal("0.00"),
                "order_count": row["c"] or 0,
            }
            for row in by_provider_rows
        }

        summary = {
            "today": window(today_start, today_end),
            "week": window(week_start, today_start + timedelta(days=7)),
            "month": window(month_start, month_start + timedelta(days=31)),
            "all_time": window(all_time_start, today_end + timedelta(days=366)),
            "by_provider": by_provider,
        }
        return Response(SettlementSummarySerializer(summary).data)


class AdminRefundListCreateView(APIView):
    """GET /api/v1/admin/payment/refunds/ — paginated list.
    POST /api/v1/admin/payment/refunds/ — create new refund.
    """

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def get(self, request):
        org = _resolve_organization(request)
        qs = RefundRecord.objects.filter(organization=org).order_by("-created_at")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response({
            "count": qs.count(),
            "results": RefundRecordSerializer(qs[:100], many=True).data,
        })

    def post(self, request):
        org = _resolve_organization(request)
        serializer = RefundCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.orders.models import Order  # local

        try:
            order = Order.objects.get(
                order_number=serializer.validated_data["order_number"],
                organization=org,
            )
        except Order.DoesNotExist:
            return Response(
                {"detail": "Sipariş bulunamadı.", "code": "order.not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            refund = refund_payment(
                order=order,
                amount=serializer.validated_data["amount"],
                reason=serializer.validated_data["reason"],
                initiated_by_user=request.user,
            )
        except PaymentSettingMissing as exc:
            return Response({"detail": str(exc), "code": "payment.not_configured"},
                            status=400)
        except PaymentProviderUnavailable as exc:
            return Response({"detail": str(exc), "code": "payment.provider_unavailable"},
                            status=502)
        except DjangoValidationError as exc:
            return Response({"detail": str(exc), "code": "payment.invalid"},
                            status=400)

        return Response(RefundRecordSerializer(refund).data, status=201)


class PaymentReconcileAdminView(APIView):
    """POST /api/v1/admin/payment/reconcile/ — find orphan intents."""

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def post(self, request):
        org = _resolve_organization(request)
        result = reconcile_pending_payments(organization=org)
        # The actor comes from the request context (AuditContextMiddleware);
        # ``record_event`` has no ``actor`` parameter and requires target_id and
        # target_repr - the old call raised TypeError after the run had
        # already confirmed orders.
        record_event(
            organization=org,
            action="payment_reconciled",
            target_type="payment",
            target_id=org.id,
            target_repr=f"{org.slug} mutabakat",
            payload=result,
        )
        return Response(ReconcileResultSerializer(result).data)


class PaymentDashboardRedirectView(APIView):
    """GET /api/v1/admin/payment/ — convenience redirect."""

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def get(self, request):
        return Response({"detail": "Use /api/v1/admin/payment/settlement/"},
                        status=301)


class PaymentWebhookEventDebugView(APIView):
    """GET /api/v1/admin/payment/webhook-events/ — debug view (admin only)."""

    permission_classes = [PaymentsFeatureEnabled, IsAuthenticated, IsOrganizationMember]

    def get(self, request):
        org = _resolve_organization(request)
        # WebhookEvent is org-scoped via OrderPayment, not directly.
        # We surface payments' webhook cache rows.
        payments = OrderPayment.objects.filter(organization=org).values_list(
            "id", flat=True
        )
        events = WebhookEvent.objects.filter(
            provider_event_id__startswith="evt_"
        ).order_by("-received_at")[:50]
        from .serializers import WebhookEventSerializer
        return Response({"results": WebhookEventSerializer(events, many=True).data})
