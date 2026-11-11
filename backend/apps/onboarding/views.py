"""Onboarding views — Sprint C3 (D-030 follow-up).

Three POST endpoints for the wizard steps 3-5, plus a GET for the
TrialBanner component:

* ``POST /api/v1/onboarding/complete/`` — materialize first category + items.
* ``POST /api/v1/onboarding/demo-seed/`` — copy Modern Cafe template.
* ``POST /api/v1/qr-codes/first/`` — bootstrap the first QR code.
* ``GET  /api/v1/onboarding/trial-status/`` — for the TrialBanner.

All endpoints require ``IsAuthenticated + IsOrganizationMember``.
Tenant isolation: ``_resolve_organization(request)`` (D-022 helper).
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOrganizationMember

from . import services
from .serializers import (
    DemoSeedResponseSerializer,
    FirstQRResponseSerializer,
    OnboardingCompleteSerializer,
    OnboardingPreferencesSerializer,
    TrialStatusSerializer,
)


def _resolve_organization(request):
    """D-022 + D-028 + D-030 helper — first membership wins."""
    from apps.accounts.services import get_active_membership

    membership = get_active_membership(request.user)
    if not membership:
        return None
    return membership.organization


def _audit_event(organization, action: str, payload: dict):
    """Best-effort audit emit — same pattern as SignupView."""
    try:
        from apps.audit.services import record_event

        record_event(
            organization=organization,
            action=action,
            target_type="organization",
            target_id=organization.id,
            target_repr=f"Organization<{organization.slug}>",
            payload=payload,
        )
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Step 3-4 — complete onboarding
# ---------------------------------------------------------------------------


class OnboardingCompleteView(APIView):
    """``POST /api/v1/onboarding/complete/``.

    Body::

        {
          "category_name": "Kahvaltı",
          "category_icon": "🥐",
          "items": [{"name": "Menemen", "price": "85.00", "description": "..."}],
          "skip_items": false
        }
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        serializer = OnboardingCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        organization = _resolve_organization(request)
        if not organization:
            return Response(
                {
                    "error": {
                        "code": "onboarding.no_organization",
                        "message": "İşletme bulunamadı.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        category, items = services.complete_onboarding(
            organization,
            category_name=data["category_name"],
            category_icon=data.get("category_icon", "🍽️"),
            items=data.get("items", []),
            skip_items=data.get("skip_items", False),
        )

        _audit_event(
            organization,
            action="onboarding_completed",
            payload={
                "category": category.name,
                "items_count": len(items),
                "skipped_items": data.get("skip_items", False),
            },
        )

        return Response(
            {
                "data": {
                    "category_id": category.id,
                    "category_name": category.name,
                    "items_count": len(items),
                },
                "meta": {},
            },
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# "Demo menüden başla" — import demo template
# ---------------------------------------------------------------------------


class DemoSeedView(APIView):
    """``POST /api/v1/onboarding/demo-seed/``.

    Idempotent — if the tenant already has any category, returns
    ``skipped=True`` and does nothing.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request)
        if not organization:
            return Response(
                {
                    "error": {
                        "code": "onboarding.no_organization",
                        "message": "İşletme bulunamadı.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            cat_count, item_count = services.import_demo_template(organization)
        except ValueError as exc:
            return Response(
                {"error": {"code": "onboarding.demo_template_missing", "message": str(exc)}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        skipped = cat_count == 0 and item_count == 0
        if not skipped:
            _audit_event(
                organization,
                action="onboarding_completed",
                payload={
                    "source": "demo_template",
                    "categories": cat_count,
                    "items": item_count,
                },
            )

        return Response(
            {
                "data": DemoSeedResponseSerializer(
                    {
                        "categories_copied": cat_count,
                        "items_copied": item_count,
                        "skipped": skipped,
                    }
                ).data,
                "meta": {},
            }
        )


# ---------------------------------------------------------------------------
# Step 2 — dil ve para birimi
# ---------------------------------------------------------------------------


class OnboardingPreferencesView(APIView):
    """``POST /api/v1/onboarding/preferences/`` — persist the wizard's
    step-2 choices (default language, supported languages, currency).

    The tenant is created in step 1, so these values could not ride along
    with the signup payload: the wizard showed them on the summary screen
    and then dropped them. They are written here, right after step 2 is
    confirmed, so the tenant's menu and prices use the language and the
    currency the operator actually chose.

    Owner only — the role gate sends every other role to the fallback
    (owner + manager); the tenant's own settings belong to its owner.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request)
        if not organization:
            return Response(
                {
                    "error": {
                        "code": "onboarding.no_organization",
                        "message": "İşletme bulunamadı.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = OnboardingPreferencesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # The tier caps how many languages a tenant may serve (BASIC: 2,
        # PRO: 4). The wizard's step 2 is a write like any other — it
        # must not be a way around the cap.
        from apps.billing.errors import LimitExceeded
        from apps.billing.services import check_count_limit

        try:
            check_count_limit(
                organization,
                "locales",
                len(data["supported_locales"]),
                actor=request.user,
            )
        except LimitExceeded as exc:
            return Response(
                {
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        **exc.extra,
                    }
                },
                status=exc.http_status,
            )

        organization = services.apply_preferences(
            organization,
            default_locale=data["default_locale"],
            supported_locales=data["supported_locales"],
            currency=data["currency"],
        )

        _audit_event(
            organization,
            action="onboarding_preferences_updated",
            payload={
                "default_locale": data["default_locale"],
                "supported_locales": data["supported_locales"],
                "currency": data["currency"],
            },
        )

        return Response(
            {
                "data": {
                    "default_locale": organization.default_locale,
                    "supported_locales": organization.supported_locales,
                    "currency": organization.currency,
                },
                "meta": {},
            },
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# Step 5 — ilk QR kodu
# ---------------------------------------------------------------------------


class FirstQRView(APIView):
    """``POST /api/v1/qr-codes/first/`` — bootstrap the first QR.

    Idempotent — if the tenant already has a QR, returns the first one.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request)
        if not organization:
            return Response(
                {
                    "error": {
                        "code": "onboarding.no_organization",
                        "message": "İşletme bulunamadı.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        qr = services.generate_first_qr(organization)
        if not qr:
            return Response(
                {"error": {"code": "qr.create_failed", "message": "QR oluşturulamadı."}},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        target_url = f"/m/{organization.slug}"
        payload = {
            "id": qr.id,
            # A QR code has no slug of its own (this line used to read
            # ``qr.slug`` and crash step 5 of the wizard): the business' slug
            # is what the printed link carries.
            "slug": organization.slug,
            "png_url": qr.png_url if hasattr(qr, "png_url") else "",
            "target_url": request.build_absolute_uri(target_url),
        }
        return Response(
            {"data": FirstQRResponseSerializer(payload).data, "meta": {}},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# TrialBanner data
# ---------------------------------------------------------------------------


class TrialStatusView(APIView):
    """``GET /api/v1/onboarding/trial-status/`` — TrialBanner data feed.

    Returns ``days_remaining`` so the banner can show
    "14 gün kaldı" → "13 gün kaldı" → ... countdown.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        from apps.billing.services import get_plan_settings
        from django.utils import timezone

        organization = _resolve_organization(request)
        if not organization:
            return Response(
                {"error": {"code": "onboarding.no_organization", "message": "İşletme bulunamadı."}},
                status=status.HTTP_403_FORBIDDEN,
            )

        ps = get_plan_settings(organization)
        in_trial = services.is_in_trial(ps)
        days_remaining = None
        if in_trial and ps.trial_ends_at:
            delta = ps.trial_ends_at - timezone.now()
            days_remaining = max(0, delta.days)

        payload = {
            "in_trial": in_trial,
            "plan": ps.active_plan,
            "trial_started_at": ps.trial_started_at,
            "trial_ends_at": ps.trial_ends_at,
            "days_remaining": days_remaining,
        }
        return Response({"data": TrialStatusSerializer(payload).data, "meta": {}})
