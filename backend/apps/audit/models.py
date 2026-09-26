"""Audit models.

Sprint 4C introduces AuditEvent — a generic, append-only audit trail for
the admin operations surface (Sprint 4B endpoints). The design follows
the "generic FK" pattern: instead of a separate FK column per target
model, we store ``target_type`` (string key like "menu" / "item") and
``target_id`` (positive integer). This keeps the schema stable when we
add new audited target types in later sprints (e.g. QR events in Sprint 5).

Decisions encoded here:

- **Generic FK pattern** (D-016) — avoids per-target FK columns and lets
  us audit any model without a schema migration. ``target_repr`` keeps a
  human-readable snapshot of the object name at the time of the event so
  recent-activity views survive deletion of the underlying record.
- **Tenant-isolated** — every event has an explicit ``organization``
  FK. Recent-events queries filter on it (see AdminSummaryView).
- **Immutable** — there is no UPDATE / DELETE endpoint; events are an
  append-only ledger.
- **7-day retention** is the V1 plan (cron cleanup lands in Sprint 6).
"""

from __future__ import annotations

from django.db import models


class AuditEvent(models.Model):
    """Append-only audit event for admin operations.

    See module docstring for the generic FK rationale (D-016).
    """

    # ---- action ----------------------------------------------------------
    ACTION_CHOICES = [
        ("created", "Created"),
        ("updated", "Updated"),
        ("deleted", "Deleted"),
        ("price_changed", "Price changed"),
        ("published", "Published"),
        ("unpublished", "Unpublished"),
        ("deactivated", "Deactivated"),
        ("reactivated", "Reactivated"),
        ("reordered", "Reordered"),
        # Sprint 7A — AI PDF menu import (D-021).
        ("ai_import_uploaded", "AI import: PDF uploaded"),
        ("ai_import_confirmed", "AI import: draft confirmed"),
        ("ai_import_discarded", "AI import: draft discarded"),
    ]

    # ---- target type -----------------------------------------------------
    TARGET_CHOICES = [
        ("menu", "Menu"),
        ("category", "Category"),
        ("item", "Item"),
        ("branch", "Branch"),
        ("theme", "Theme"),
        ("organization", "Organization"),
        # Sprint 7A — AI PDF menu import (D-021).
        ("menu_import_draft", "Menu Import Draft"),
    ]

    actor = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
        help_text="Null = system-initiated (e.g. seed, cron).",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="audit_events",
    )
    action = models.CharField(max_length=30, choices=ACTION_CHOICES)
    target_type = models.CharField(max_length=30, choices=TARGET_CHOICES)
    target_id = models.PositiveIntegerField()
    target_repr = models.CharField(
        max_length=200,
        help_text="Human-readable snapshot of the target at event time "
        "(e.g. 'Türk Kahvesi (modern-cafe)').",
    )
    payload = models.JSONField(
        default=dict,
        blank=True,
        help_text="Change details — e.g. {'old': '75.00', 'new': '85.00'}.",
    )
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Audit Event"
        verbose_name_plural = "Audit Events"
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["target_type", "target_id"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"<AuditEvent {self.action} {self.target_type}#{self.target_id} "
            f"@ {self.created_at:%Y-%m-%d %H:%M:%S}>"
        )
