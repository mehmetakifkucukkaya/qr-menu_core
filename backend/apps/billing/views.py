"""Billing views — Sprint B1 (D-026).

Six admin endpoints under ``/api/v1/admin/billing/``:

* GET  /plan/                    — current PlanSettings row
* PUT  /plan/                    — operator update plan/feature/note
* GET  /usage/                   — current-month metric snapshot
* GET  /limits/                  — static 4-plan comparison matrix
* POST /limits/preview-upgrade/  — diff current → target plan
* POST /reset-usage/             — superuser-only demo helper

All endpoints use ``IsAuthenticated + IsOrganizationMember``. The
reset-usage endpoint additionally requires ``is_superuser``.

Tenant isolation mirrors the D-026 payment pattern — the operator's
first active membership wins. Platform admins with no membership
get 403 (the views don't accept a ``?organization=<slug>`` override
because billing is intentionally operator-scoped, not platform-scoped
in V1).
"""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOrganizationMember

from . import services
from .serializers import (
    LimitMatrixSerializer,
    PlanSettingsSerializer,
    PlanSettingsUpdateSerializer,
    UpgradePreviewRequestSerializer,
    UsageSnapshotSerializer,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_organization(request: Request):
    """D-022 + D-026 helper — first active membership → organization.

    Returns ``None`` (and the caller raises 403) when the user has no
    active membership. Mirrors the helper in
    ``apps/payment/views.py`` so the operator UX is consistent.
    """
    from apps.accounts.models import Membership

    membership = (
        Membership.objects.filter(
            user=request.user, organization__is_active=True
        )
        .select_related("organization")
        .first()
    )
    if membership is None:
        raise PermissionDenied("Henüz bir işletmeye üye değilsiniz.")
    return membership.organization


def _wrap(data, request: Request) -> Response:
    """Standard ``{data, meta}`` envelope."""
    return Response(
        {
            "data": data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        }
    )


# ---------------------------------------------------------------------------
# /admin/billing/plan/
# ---------------------------------------------------------------------------


class BillingPlanAdminView(APIView):
    """GET /api/v1/admin/billing/plan/ — current PlanSettings."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        org = _resolve_organization(request)
        ps = services.get_plan_settings(org)
        return _wrap(PlanSettingsSerializer(ps).data, request)

    def put(self, request: Request) -> Response:
        org = _resolve_organization(request)
        serializer = PlanSettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        ps = services.update_plan_settings(
            organization=org,
            active_plan=data.get("active_plan"),
            feature_overrides=data.get("features"),
            billing_notes=data.get("billing_notes"),
        )
        return _wrap(PlanSettingsSerializer(ps).data, request)


# ---------------------------------------------------------------------------
# /admin/billing/usage/
# ---------------------------------------------------------------------------


class BillingUsageAdminView(APIView):
    """GET /api/v1/admin/billing/usage/ — current-month metric snapshot."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        org = _resolve_organization(request)
        ps = services.get_plan_settings(org)
        from django.utils import timezone

        now = timezone.now()
        snapshot = services.get_usage_snapshot(org)
        body = {
            "period_year": now.year,
            "period_month": now.month,
            "metrics": snapshot,
        }
        # Validate response against serializer to catch schema drift
        # during development (cheap + helpful).
        serializer = UsageSnapshotSerializer(body)
        return _wrap(serializer.data, request)


# ---------------------------------------------------------------------------
# /admin/billing/limits/
# ---------------------------------------------------------------------------


class BillingLimitsAdminView(APIView):
    """GET /api/v1/admin/billing/limits/ — 4-plan static comparison matrix."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        org = _resolve_organization(request)
        matrix = services.get_plan_limit_matrix(org)
        serializer = LimitMatrixSerializer(matrix)
        return _wrap(serializer.data, request)


# ---------------------------------------------------------------------------
# /admin/billing/limits/preview-upgrade/
# ---------------------------------------------------------------------------


class BillingPreviewUpgradeAdminView(APIView):
    """POST /api/v1/admin/billing/limits/preview-upgrade/ — plan diff."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        org = _resolve_organization(request)
        serializer = UpgradePreviewRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_plan = serializer.validated_data["target_plan"]

        preview = services.preview_upgrade(org, target_plan)

        # Audit the preview as ``plan_upgraded_preview`` so the admin UI
        # can show "operator X previewed upgrade to PRO 3 times today"
        # without a separate logging table.
        from apps.audit.services import record_event

        record_event(
            organization=org,
            action="plan_upgraded_preview",
            target_type="plan_settings",
            target_id=services.get_plan_settings(org).id,
            target_repr=f"PlanSettings<{org.id}>",
            payload={
                "current_plan": preview["current_plan"],
                "target_plan": preview["target_plan"],
                "feature_delta_count": len(preview["feature_deltas"]),
                "resource_delta_count": len(preview["resource_deltas"]),
            },
        )
        return _wrap(preview, request)


# ---------------------------------------------------------------------------
# /admin/billing/reset-usage/
# ---------------------------------------------------------------------------


class BillingResetUsageAdminView(APIView):
    """POST /api/v1/admin/billing/reset-usage/ — superuser demo helper.

    V1 doesn't run a monthly counter cron (that's V2 SaaS). Demo
    operators use this endpoint at the start of every demo session to
    reset the counter rows so the "you're at 500/1000" UI is fresh.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        if not request.user.is_superuser:
            return Response(
                {
                    "error": {
                        "code": "billing.reset_superuser_only",
                        "message": "Bu endpoint sadece süper kullanıcılar içindir.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        org = _resolve_organization(request)
        deleted = services.reset_usage_for_org(org)
        return _wrap({"reset_count": deleted, "organization_id": org.id}, request)