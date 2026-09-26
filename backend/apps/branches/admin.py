"""Admin for Branch."""

from django.contrib import admin

from .models import Branch


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
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
