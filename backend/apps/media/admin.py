"""Uploaded media in the agency panel - read-only."""

from django.contrib import admin

from apps.core.admin_base import ReadOnlyModelAdmin

from .models import MediaAsset


@admin.register(MediaAsset)
class MediaAssetAdmin(ReadOnlyModelAdmin):
    list_display = (
        "original_filename", "organization", "kind", "content_type", "size_kb",
        "uploaded_by", "is_active", "created_at",
    )
    list_filter = ("kind", "is_active")
    search_fields = ("original_filename", "alt_text", "organization__name", "organization__slug")
    list_select_related = ("organization", "uploaded_by")

    @admin.display(description="Boyut (KB)", ordering="size_bytes")
    def size_kb(self, obj):
        return round(obj.size_bytes / 1024, 1)
