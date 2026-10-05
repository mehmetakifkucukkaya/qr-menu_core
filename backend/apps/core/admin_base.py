"""Shared admin base classes for the agency panel."""

from __future__ import annotations

from django.contrib import admin


class ReadOnlyModelAdmin(admin.ModelAdmin):
    """Evidence, not a workbench: rows can be listed, searched and opened, never
    added, changed or deleted (not even in bulk)."""

    show_full_result_count = False

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
