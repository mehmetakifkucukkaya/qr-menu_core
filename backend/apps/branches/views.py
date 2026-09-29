"""Branch API views (admin-only, tenant-isolated)."""

from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsOrganizationMember
from apps.billing.errors import LimitExceeded
from apps.billing.services import enforce_limit

from .models import Branch
from .serializers import BranchSerializer


def _resolve_org_for_user(request):
    """First active membership → organization (D-022 + D-026 mirror)."""
    from apps.accounts.models import Membership

    membership = (
        Membership.objects.filter(
            user=request.user, organization__is_active=True
        )
        .select_related("organization")
        .first()
    )
    return membership.organization if membership else None


class BranchViewSet(viewsets.ModelViewSet):
    """CRUD for branches the current user can access.

    Queryset is filtered via ``Branch.objects.for_user(request.user)``
    so users only see branches of orgs they belong to.

    Sprint B1 — D-026 limit enforcement. ``branches`` resource is
    bounded per Plan tier (BASIC=2, PRO=5, ORDERS=10, OPS=∞). The
    guard audits ``limit_exceeded_attempt`` and raises HTTP 402
    ``billing.limit_exceeded`` when the tenant is at the cap.
    """

    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        return (
            Branch.objects.for_user(self.request.user)
            .select_related("organization")
            .order_by("organization__name", "name")
        )

    def create(self, request, *args, **kwargs):
        org = _resolve_org_for_user(request)
        if org is None:
            return Response(
                {
                    "error": {
                        "code": "branch.no_organization",
                        "message": "İşletme bulunamadı.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            enforce_limit(org, "branches", actor=request.user)
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
        return super().create(request, *args, **kwargs)