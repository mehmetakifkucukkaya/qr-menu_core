"""Uploaded media in the agency panel - read-only."""

from django.contrib import admin

from apps.core.admin_base import ReadOnlyModelAdmin, TurkishLabelsMixin, labelled_form

from .models import MediaAsset

KIND_LABELS = {"image": "Görsel", "video": "Video", "audio": "Ses", "file": "Dosya"}


@admin.register(MediaAsset)
class MediaAssetAdmin(TurkishLabelsMixin, ReadOnlyModelAdmin):
    form = labelled_form(
        MediaAsset,
        {
            "organization": "İşletme",
            "kind": "Tür",
            "original_filename": "Dosya adı",
            "content_type": "İçerik türü",
            "size_bytes": "Boyut (bayt)",
            "storage_key": "Depolama yolu",
            "public_url": "Herkese açık adres",
            "width": "Genişlik",
            "height": "Yükseklik",
            "alt_text": "Alternatif metin",
            "uploaded_by": "Yükleyen",
            "is_active": "Aktif",
            "thumbnail_key": "Küçük görsel yolu",
            "thumbnail_url": "Küçük görsel adresi",
            "created_at": "Yüklenme",
            "updated_at": "Güncellenme",
        },
    )
    list_display = (
        "original_filename", "organization", "kind_label", "content_type", "size_kb",
        "uploaded_by", "is_active", "created_at",
    )
    labels = {
        "original_filename": "Dosya",
        "organization": "İşletme",
        "kind": "Tür",
        "content_type": "İçerik türü",
        "uploaded_by": "Yükleyen",
        "is_active": "Aktif",
        "created_at": "Yüklenme",
    }
    value_labels = {"kind": KIND_LABELS}
    list_filter = ("kind", "is_active")
    search_fields = ("original_filename", "alt_text", "organization__name", "organization__slug")
    list_select_related = ("organization", "uploaded_by")

    @admin.display(description="Tür", ordering="kind")
    def kind_label(self, obj):
        return KIND_LABELS.get(obj.kind, obj.kind)

    @admin.display(description="Boyut (KB)", ordering="size_bytes")
    def size_kb(self, obj):
        return round(obj.size_bytes / 1024, 1)
