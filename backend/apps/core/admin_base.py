"""Shared admin base classes for the agency panel."""

from __future__ import annotations

from django.contrib import admin


def deleting_a_customer(request) -> bool:
    """True on the customer's own delete page.

    Rows the panel protects on their own (the plan, uploaded media, view events)
    must still go away WITH their customer. Django's delete page asks the admin
    of every row that would be deleted along for permission, so the protection is
    lifted for that one page and nowhere else.
    """
    match = getattr(request, "resolver_match", None)
    return bool(match and match.url_name == "organizations_organization_delete")


class ReadOnlyModelAdmin(admin.ModelAdmin):
    """Evidence, not a workbench: rows can be listed, searched and opened, never
    added or changed, and deleted only together with their customer (never on
    their own, never in bulk)."""

    show_full_result_count = False

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return deleting_a_customer(request)
