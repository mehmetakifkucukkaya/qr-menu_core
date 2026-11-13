"""Organization API views (admin-only, tenant-isolated)."""

from __future__ import annotations

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.permissions import IsOrganizationMember, IsPlatformAdmin

from .models import Organization
from .serializers import OrganizationSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    """CRUD for organizations the current user is a member of.

    - list / retrieve: filtered via ``Organization.objects.for_user(request.user)``
    - create: platform admins only. Tenants are created by the signup /
      onboarding flow; an open endpoint let any logged-in user mint
      unlimited OPS-plan tenants (ANALYSIS_1 F-09). The creator still
      becomes owner via Membership.
    - update / partial_update / destroy: scoped to user's organizations;
      admins can act on any org.
    """

    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_permissions(self):
        if self.action == "create":
            return [IsAuthenticated(), IsPlatformAdmin()]
        return super().get_permissions()

    def get_queryset(self):
        return Organization.objects.for_user(self.request.user).order_by("name")

    def perform_create(self, serializer):
        organization = serializer.save()
        # Auto-create owner membership for the creator.
        from apps.accounts.models import Membership, MembershipRole

        Membership.objects.get_or_create(
            user=self.request.user,
            organization=organization,
            defaults={"role": MembershipRole.OWNER},
        )

    def update(self, request, *args, **kwargs):
        """Guard the language count before the tenant widens its menu.

        ``locales`` is one of the tier caps (``enforce_limit`` knew how to
        count it but nothing called it): a BASIC tenant may serve two
        languages, a PRO tenant four. Without the check a tenant could
        add languages one request at a time and stay on the cheap tier.
        """
        organization = self.get_object()
        requested = request.data.get("supported_locales")
        if requested is not None:
            from apps.billing.errors import LimitExceeded
            from apps.billing.services import check_count_limit

            try:
                check_count_limit(
                    organization, "locales", len(requested), actor=request.user
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
        return super().update(request, *args, **kwargs)
