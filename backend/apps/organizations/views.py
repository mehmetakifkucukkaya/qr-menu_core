"""Organization API views (admin-only, tenant-isolated)."""

from __future__ import annotations

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request

from apps.accounts.permissions import IsOrganizationMember

from .models import Organization
from .serializers import OrganizationSerializer


class OrganizationViewSet(viewsets.ModelViewSet):
    """CRUD for organizations the current user is a member of.

    - list / retrieve: filtered via ``Organization.objects.for_user(request.user)``
    - create: any authenticated user can create (they become owner via Membership)
    - update / partial_update / destroy: scoped to user's organizations;
      admins can act on any org.
    """

    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

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
