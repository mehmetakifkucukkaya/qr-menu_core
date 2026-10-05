"""Billing admin - the plan page of the agency panel (D-026, SPEC_PILOT_READINESS 4.3).

A change made here goes through :func:`apps.billing.services.update_plan_settings`
like the API does: the flags follow the plan, a plan decision ends a trial, and
every change is audited with the signed-in agency user as the actor.
"""

from __future__ import annotations

from django import forms
from django.contrib import admin

from apps.audit.services import record_event

from .constants import FEATURE_FIELDS, FEATURE_LABELS
from .models import PlanSettings, TenantUsageCounter
from .services import update_plan_settings


class PlanSettingsAdminForm(forms.ModelForm):
    class Meta:
        model = PlanSettings
        fields = "__all__"
        labels = {
            "organization": "İşletme",
            "active_plan": "Paket",
            "billing_notes": "Fatura / operatör notu",
            **FEATURE_LABELS,
        }
        help_texts = {
            "active_plan": (
                "Paketi değiştirmek özellikleri yeni paketin varsayılanlarına çeker "
                "(aynı kayıtta işaretlediğiniz özellikler korunur) ve deneme süresini sona erdirir."
            ),
        }


@admin.register(PlanSettings)
class PlanSettingsAdmin(admin.ModelAdmin):
    form = PlanSettingsAdminForm
    list_display = ("organization", "plan", "orders_on", "loyalty_on", "trial_end", "updated_at")
    list_filter = ("active_plan", "cart_enabled", "orders_enabled", "loyalty_enabled")
    search_fields = ("organization__name", "organization__slug")
    readonly_fields = ("trial_started_at", "trial_ends_at", "created_at", "updated_at")
    fieldsets = (
        (None, {"fields": ("organization", "active_plan", "billing_notes")}),
        ("Modüller ve özellikler", {"fields": FEATURE_FIELDS}),
        ("Deneme", {"fields": ("trial_started_at", "trial_ends_at")}),
        ("Kayıt", {"fields": ("created_at", "updated_at")}),
    )

    def get_readonly_fields(self, request, obj=None):
        # A plan row belongs to its customer for good.
        extra = ("organization",) if obj else ()
        return (*super().get_readonly_fields(request, obj), *extra)

    def has_delete_permission(self, request, obj=None):
        # Without a row the customer silently falls back to the default plan.
        return False

    def save_model(self, request, obj, form, change):
        if not change:
            super().save_model(request, obj, form, change)
            record_event(
                organization=obj.organization,
                action="plan_changed",
                target_type="plan_settings",
                target_id=obj.id,
                target_repr=str(obj),
                payload={
                    "reason": "created_in_admin",
                    "after": {"active_plan": obj.active_plan, "features": obj.effective_features()},
                },
            )
            return
        if not form.changed_data:
            return
        # What was edited goes through the service (flags follow the plan, a plan
        # decision ends the trial, one audit event with before/after); flags
        # edited in the same save are explicit overrides and win.
        update_plan_settings(
            obj.organization,
            active_plan=obj.active_plan if "active_plan" in form.changed_data else None,
            feature_overrides={
                flag: getattr(obj, flag) for flag in FEATURE_FIELDS if flag in form.changed_data
            }
            or None,
            billing_notes=obj.billing_notes if "billing_notes" in form.changed_data else None,
        )
        obj.refresh_from_db()

    # ---- list columns (Turkish headers)

    @admin.display(description="Paket", ordering="active_plan")
    def plan(self, obj):
        return obj.get_active_plan_display()

    @admin.display(description="Sipariş + mutfak", boolean=True, ordering="orders_enabled")
    def orders_on(self, obj):
        return obj.orders_enabled

    @admin.display(description="Sadakat", boolean=True, ordering="loyalty_enabled")
    def loyalty_on(self, obj):
        return obj.loyalty_enabled

    @admin.display(description="Deneme bitişi", ordering="trial_ends_at")
    def trial_end(self, obj):
        return obj.trial_ends_at or "—"


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