"""Menu-view events in the agency panel - read-only."""

from django.contrib import admin

from apps.core.admin_base import ReadOnlyModelAdmin

from .models import MenuViewEvent


@admin.register(MenuViewEvent)
class MenuViewEventAdmin(ReadOnlyModelAdmin):
    list_display = ("created_at", "organization", "event_type", "locale", "path", "menu")
    list_filter = ("event_type", "locale", "created_at")
    search_fields = ("organization__name", "organization__slug", "path")
    date_hierarchy = "created_at"
    list_select_related = ("organization", "menu")
