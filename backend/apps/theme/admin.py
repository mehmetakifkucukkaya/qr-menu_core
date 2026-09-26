"""Admin for ThemeConfig."""

from django.contrib import admin

from .models import ThemeConfig


@admin.register(ThemeConfig)
class ThemeConfigAdmin(admin.ModelAdmin):
    list_display = ("organization", "layout_variant", "primary_color", "updated_at")
    list_filter = ("layout_variant", "font_family")
    search_fields = ("organization__name", "organization__slug")
    autocomplete_fields = ("organization",)
    readonly_fields = ("created_at", "updated_at")
