"""Admin for Organization."""

from django.contrib import admin

from .models import Organization


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "default_locale", "currency", "is_active", "updated_at")
    list_filter = ("is_active", "default_locale", "currency")
    search_fields = ("name", "slug", "legal_name", "email", "phone")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("name", "slug", "legal_name", "description", "is_active")}),
        ("Görseller", {"fields": ("logo", "cover_image")}),
        (
            "İletişim",
            {
                "fields": (
                    "phone",
                    "whatsapp_phone",
                    "email",
                    "website",
                    "instagram_url",
                    "address",
                    "google_maps_url",
                )
            },
        ),
        (
            "Yerelleştirme",
            {"fields": ("default_locale", "supported_locales", "currency")},
        ),
        ("Önemli tarihler", {"fields": ("created_at", "updated_at")}),
    )
