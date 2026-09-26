"""Branch API views (admin-only, tenant-isolated)."""

from __future__ import annotations

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsOrganizationMember

from .models import Branch
from .serializers import BranchSerializer


class BranchViewSet(viewsets.ModelViewSet):
    """CRUD for branches the current user can access.

    Queryset is filtered via ``Branch.objects.for_user(request.user)``
    so users only see branches of orgs they belong to.
    """

    serializer_class = BranchSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        return (
            Branch.objects.for_user(self.request.user)
            .select_related("organization")
            .order_by("organization__name", "name")
        )
