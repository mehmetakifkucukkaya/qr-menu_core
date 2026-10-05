"""Audit trail in the agency panel - read-only.

Every agency action (opening, suspending, extending, plan changes) and every
business' own edits land here through ``apps.audit.services.record_event``.
"""

from django.contrib import admin

from apps.core.admin_base import ReadOnlyModelAdmin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(ReadOnlyModelAdmin):
    list_display = ("created_at", "business", "actor", "action", "target_type", "target_repr")
    list_filter = ("action", "target_type", "created_at")
    search_fields = ("organization_label", "target_repr", "actor__email")
    date_hierarchy = "created_at"
    list_select_related = ("actor",)
    ordering = ("-created_at",)

    @admin.display(description="İşletme", ordering="organization_label")
    def business(self, obj):
        # The label outlives the business (organization becomes empty on delete).
        return obj.organization_label or "—"
