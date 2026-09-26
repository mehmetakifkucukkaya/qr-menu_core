"""Serializers for ThemeConfig."""

from __future__ import annotations

from rest_framework import serializers

from apps.organizations.models import Organization
from apps.organizations.serializers import OrganizationSummarySerializer

from .models import ThemeConfig


class ThemeConfigSerializer(serializers.ModelSerializer):
    organization = OrganizationSummarySerializer(read_only=True)
    organization_id = serializers.PrimaryKeyRelatedField(
        source="organization",
        write_only=True,
        queryset=Organization.objects.none(),
    )

    class Meta:
        model = ThemeConfig
        fields = (
            "id",
            "organization",
            "organization_id",
            "primary_color",
            "secondary_color",
            "accent_color",
            "background_color",
            "text_color",
            "font_family",
            "layout_variant",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "organization")

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
