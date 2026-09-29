"""Billing admin — Sprint B1 (D-026).

Read-mostly Django admin surface. Lifecycle mutations (plan change /
feature override / usage reset) must go through the DRF API so the
audit log captures them.
"""

from __future__ import annotations

from django.contrib import admin

from .models import PlanSettings, TenantUsageCounter


@admin.register(PlanSettings)
class PlanSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "active_plan",
        "cart_enabled",
        "orders_enabled",
        "loyalty_enabled",
        "payments_enabled",
        "updated_at",
    )
    list_filter = ("active_plan", "cart_enabled", "orders_enabled", "loyalty_enabled")
    search_fields = ("organization__name", "organization__slug")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        (None, {
            "fields": ("organization", "active_plan", "billing_notes"),
        }),
        ("Feature flags", {
            "fields": (
                "cart_enabled",
                "orders_enabled",
                "loyalty_enabled",
                "customer_accounts_enabled",
                "payments_enabled",
                "ai_pdf_import_enabled",
                "ai_translate_enabled",
                "advanced_analytics_enabled",
            ),
        }),
        ("Audit", {
            "fields": ("created_at", "updated_at"),
        }),
    )


@admin.register(TenantUsageCounter)
class TenantUsageCounterAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "period_year",
        "period_month",
        "views",
        "scans",
        "ai_pdf_imports",
        "ai_translate_ops",
        "ai_description_ops",
    )
    list_filter = ("period_year", "period_month")
    search_fields = ("organization__name", "organization__slug")
    readonly_fields = (
        "organization",
        "period_year",
        "period_month",
        "views",
        "scans",
        "ai_pdf_imports",
        "ai_translate_ops",
        "ai_description_ops",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):  # pragma: no cover
        # Counters are created implicitly via ``current_for()`` on first
        # ``record_usage`` call. Adding a row here would risk a
        # zero-default state for (org, year, month) that the analytics
        # pipeline would have to detect.
        return False