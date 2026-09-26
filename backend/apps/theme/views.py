"""Theme API views (admin-only, tenant-isolated)."""

from __future__ import annotations

from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import IsOrganizationMember

from .models import ThemeConfig
from .serializers import ThemeConfigSerializer


class ThemeConfigViewSet(viewsets.ModelViewSet):
    """CRUD for ThemeConfig, scoped to orgs the user is a member of."""

    serializer_class = ThemeConfigSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        qs = ThemeConfig.objects.select_related("organization")
        user = self.request.user
        if getattr(user, "is_platform_admin", False):
            return qs
        return qs.filter(organization__memberships__user=user).distinct()
