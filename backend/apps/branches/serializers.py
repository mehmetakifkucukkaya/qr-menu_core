"""Serializers for Branch."""

from __future__ import annotations

from rest_framework import serializers

from apps.organizations.models import Organization
from apps.organizations.serializers import OrganizationSummarySerializer

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    organization = OrganizationSummarySerializer(read_only=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        source="organization",
        write_only=True,
        # Queryset is overridden in __init__ to scope to user's memberships.
        queryset=Organization.objects.none(),
    )

    class Meta:
        model = Branch
        fields = (
            "id",
            "organization",
            "organization_id",
            "name",
            "slug",
            "phone",
            "whatsapp_phone",
            "address",
            "google_maps_url",
            "working_hours_json",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "organization")
        extra_kwargs = {
            "slug": {"required": False},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        user = request.user
        if getattr(user, "is_platform_admin", False):
            qs = Organization.objects.all()
        else:
            qs = Organization.objects.filter(memberships__user=user).distinct()
        self.fields["organization_id"].queryset = qs
