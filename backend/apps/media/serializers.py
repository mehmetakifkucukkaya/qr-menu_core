"""Media serializers — Sprint E1 (D-033)."""

from __future__ import annotations

from rest_framework import serializers

from .models import MediaAsset


class MediaAssetSerializer(serializers.ModelSerializer):
    """MediaAsset read payload (used by list + detail endpoints)."""

    uploaded_by_email = serializers.CharField(
        source="uploaded_by.email", read_only=True, default=None
    )

    class Meta:
        model = MediaAsset
        fields = (
            "id",
            "kind",
            "original_filename",
            "content_type",
            "size_bytes",
            "storage_key",
            "public_url",
            "width",
            "height",
            "alt_text",
            "uploaded_by_email",
            "thumbnail_url",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
