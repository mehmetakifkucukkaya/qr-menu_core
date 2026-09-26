"""Serializers for Organization."""

from __future__ import annotations

from rest_framework import serializers

from .models import Organization


class OrganizationSerializer(serializers.ModelSerializer):
    """Full organization representation (admin endpoints)."""

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "legal_name",
            "description",
            "logo",
            "cover_image",
            "phone",
            "whatsapp_phone",
            "email",
            "website",
            "instagram_url",
            "address",
            "google_maps_url",
            "default_locale",
            "supported_locales",
            "currency",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class OrganizationSummarySerializer(serializers.ModelSerializer):
    """Minimal org representation for nested resources."""

    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "logo", "default_locale", "currency")
        read_only_fields = fields
