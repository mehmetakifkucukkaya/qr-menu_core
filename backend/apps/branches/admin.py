"""Admin for Branch."""

from django import forms
from django.contrib import admin

from apps.menu.services.working_hours import (
    normalize_working_hours,
    validate_working_hours_schema,
)

from .models import Branch


class BranchAdminForm(forms.ModelForm):
    """Custom form to validate working_hours_json against OP-8 schema."""

    class Meta:
        model = Branch
        fields = "__all__"

    def clean_working_hours_json(self):
        raw = self.cleaned_data.get("working_hours_json")
        # Accept empty / None as a valid empty dict.
        if raw in (None, "", {}):
            return {}
        try:
            validate_working_hours_schema(raw)
        except Exception as exc:  # ValidationError → form error
            raise forms.ValidationError(str(exc))
        return normalize_working_hours(raw)


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    form = BranchAdminForm
    list_display = (
        "name",
        "organization",
        "slug",
        "is_active",
        "phone",
        "updated_at",
    )
    list_filter = ("is_active", "organization")
    search_fields = ("name", "slug", "phone", "address", "organization__name")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("organization",)
    fieldsets = (
        (None, {"fields": ("organization", "name", "slug", "is_active")}),
        (
            "İletişim",
            {
                "fields": (
                    "phone",
                    "whatsapp_phone",
                    "address",
                    "google_maps_url",
                )
            },
        ),
        (
            "Çalışma Saatleri (OP-8)",
            {
                "fields": ("working_hours_json",),
                "description": (
                    "JSON şema: {'mon':[{'open':'08:00','close':'22:00'}], ...}. "
                    "Eksik günler boş liste olarak normalleştirilir."
                ),
            },
        ),
        ("Önemli tarihler", {"fields": ("created_at", "updated_at")}),
    )