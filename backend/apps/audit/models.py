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
        # Sprint 8A — Order flow (D-022). The trailing action names map
        # 1:1 onto ``OrderStatus`` values to keep ``payload.from/to`` and
        # ``order_<status>`` event lookups trivial.
        ("order_placed", "Order: placed (customer submission)"),
        ("order_confirmed", "Order: confirmed by admin"),
        ("order_preparing", "Order: preparing (kitchen accepted)"),
        ("order_ready", "Order: ready (customer notified)"),
        ("order_delivered", "Order: delivered"),
        ("order_cancelled", "Order: cancelled"),
        # Sprint 9A — AI translation + description (D-021 reuse). One
        # event per generation so the audit feed can later surface
        # "AI activity" alongside admin human edits.
        ("ai_translation_generated", "AI translation: generated"),
        ("ai_description_generated", "AI description: generated"),
        # Sprint 10A — Customer accounts + loyalty ledger (D-025). The
        # five actions cover the magic-link auth flow plus the
        # earn/redeem/adjust lifecycle for loyalty puan.
        ("customer_registered", "Customer: registered (first magic link)"),
        ("customer_login", "Customer: logged in (magic link verified)"),
        ("loyalty_earned", "Loyalty: points earned"),
        ("loyalty_redeemed", "Loyalty: points redeemed"),
        ("loyalty_adjusted", "Loyalty: manual admin adjust"),
        # Sprint 11A — Online payment (Stripe primary + iyzico adapter)
        # round-up flow. The 5 actions cover the webhook events + the
        # admin-side refund / provider-test / reconcile paths.
        ("order_paid", "Order: payment captured (webhook)"),
        ("order_refunded", "Order: payment refunded"),
        ("payment_provider_test", "Payment: provider test ping"),
        ("payment_webhook_received", "Payment: webhook event received"),
        ("payment_reconciled", "Payment: reconciliation triggered"),
        # Sprint B1 — Plan + Feature Flags + Limits (D-026). Four
        # actions cover the operator plan-change path + the two guard
        # trip paths (``limit_exceeded_attempt`` from
        # ``enforce_limit``, ``feature_disabled_access`` from
        # ``require_feature``).
        ("plan_changed", "Billing: plan tier + features updated"),
        ("plan_upgraded_preview", "Billing: plan upgrade previewed"),
        ("limit_exceeded_attempt", "Billing: limit exceeded attempt"),
        ("feature_disabled_access", "Billing: feature disabled access attempt"),
        # Sprint C1 — Self-serve onboarding (D-030 follow-up). Emitted
        # by SignupView after the atomic User + Organization +
        # Membership + PlanSettings transaction commits. The ``organization``
        # target_type already exists from Sprint 4 so no schema change
        # needed for the FK side — only the ACTION_CHOICES entry.
        ("tenant_created", "Onboarding: tenant + owner signup"),
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
        # Sprint 8A — Order flow (D-022). Generic FK target for both
        # customer-side ``order_placed`` and admin-side status
        # transition events. ``target_id`` = Order.pk.
        ("order", "Order"),
        # Sprint 9A — AI translation + description targets. Translations
        # point at ``TranslationMemory.pk``; descriptions point at
        # ``MenuItem.pk`` (with action=ai_description_generated).
        ("translation_memory", "Translation Memory"),
        ("ai_product_description", "AI Product Description"),
        # Sprint 10A — Customer + loyalty ledger targets (D-025).
        # ``customer`` covers register/login actions; ``loyalty_settings``
        # covers admin settings changes; loyalty transactions use
        # ``loyalty_transaction`` for per-row audits.
        ("customer", "Customer"),
        ("loyalty_settings", "Loyalty Settings"),
        ("loyalty_transaction", "Loyalty Transaction"),
        # Sprint 11A — Online payment target (D-026). Generic FK target
        # for both ``order_paid`` (payment captured) and ``order_refunded``
        # (refund issued) events. ``target_id`` = OrderPayment.pk.
        ("payment", "Payment"),
        # Sprint B1 — Plan + Feature Flags + Limits target (D-026).
        # Generic FK for plan_changed / plan_upgraded_preview /
        # limit_exceeded_attempt / feature_disabled_access events.
        # ``target_id`` = PlanSettings.pk.
        ("plan_settings", "Plan Settings"),
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
