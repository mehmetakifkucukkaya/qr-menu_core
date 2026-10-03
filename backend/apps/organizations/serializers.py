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
    """Minimal org representation for nested resources + public menu payload.

    Sprint A additions (Faz 1.1 + Faz 2.1):

    * ``logo`` / ``cover_image`` resolve to a public URL (D-014-style
      multi-tenant theming applies on top, but the raw URL must round-trip
      correctly so admin uploads surface in the public hero). The helper
      accepts both absolute URLs (the typical media-upload flow) and a
      raw ``FieldFile`` (legacy admin-form upload) and always returns a
      usable string.
    * ``description``, ``address``, ``google_maps_url``, ``website``,
      ``email``, ``phone`` are exposed so the public menu footer / hero
      can render contact + location without a second admin round-trip.
    """

    logo = serializers.SerializerMethodField()
    cover_image = serializers.SerializerMethodField()

    def get_logo(self, obj: Organization):
        return _resolve_image_url(obj.logo)

    def get_cover_image(self, obj: Organization):
        return _resolve_image_url(obj.cover_image)

    class Meta:
        model = Organization
        fields = (
            "id",
            "name",
            "slug",
            "logo",
            "cover_image",
            "description",
            "address",
            "google_maps_url",
            "website",
            "email",
            "phone",
            "default_locale",
            "supported_locales",
            "currency",
        )
        read_only_fields = fields


def _resolve_image_url(field) -> str | None:
    """Normalize an ImageField-ish value to a public URL.

    Mirrors ``apps.menu.services.visibility.image_url`` — kept local here
    to avoid a circular import between ``organizations`` and ``menu``
    serializers. Handles three shapes:

    * ``None`` / empty string → ``None``
    * absolute URL (``http://...``, ``https://...``) or root-relative URL
      (``/media/tenants/...``, what the MediaAsset upload returns for local
      storage) → passed through; ``field.url`` would mangle both
    * anything else (Django ``FieldFile``) → ``field.url`` (prepends MEDIA_URL)

    The media-upload endpoint returns absolute URLs (Sprint 5B); the legacy
    Django admin form upload path stores a ``FieldFile`` that needs the
    MEDIA_URL prefix. Public clients must always see a fully-qualified URL
    so the hero never renders a broken ``/organizations/logos/x.jpg``.
    """
    if not field:
        return None
    value = str(field)
    if value.startswith(("http://", "https://", "/")):
        return value
    return field.url