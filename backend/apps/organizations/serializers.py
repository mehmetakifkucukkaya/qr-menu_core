"""Serializers for Organization."""

from __future__ import annotations

from rest_framework import serializers

from .models import Organization


class OrganizationSerializer(serializers.ModelSerializer):
    """Full organization representation (admin endpoints)."""

    # See MenuCategorySerializer — accept URL strings for image fields so the
    # multipart-upload-then-PATCH-URL flow (Sprint 5B) works without forcing
    # the client to send multipart on every PATCH.
    logo = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )
    cover_image = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )

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

    # See OrganizationSerializer — accept URL strings so the
    # multipart-upload-then-PATCH-URL flow works (Sprint 5B). Auto-derived
    # ImageField serializer would prepend MEDIA_URL to absolute URLs.
    logo = serializers.CharField(
        max_length=500, required=False, allow_blank=True, allow_null=True
    )

    class Meta:
        model = Organization
        fields = ("id", "name", "slug", "logo", "default_locale", "currency")
        read_only_fields = fields
