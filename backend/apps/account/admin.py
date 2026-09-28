"""Django admin registration for the account app — Sprint 10A (D-025).

Read-mostly surface for ops / debugging. Lifecycle mutations (issue
magic link, redeem, adjust puan) must go through the API so the
audit log captures them.
"""

from __future__ import annotations

from django.contrib import admin

from .models import Customer, LoyaltySettings, LoyaltyTransaction, MagicLinkToken


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "email",
        "full_name",
        "phone",
        "is_active",
        "last_login_at",
        "created_at",
    )
    list_filter = ("is_active", "created_at")
    search_fields = ("email", "full_name", "phone")
    readonly_fields = (
        "created_at",
        "updated_at",
        "last_login_at",
    )

    def has_add_permission(self, request):  # pragma: no cover
        # Customers are created via the magic-link auth flow, not
        # through Django admin. The "create" path is enrollment.
        return False


@admin.register(MagicLinkToken)
class MagicLinkTokenAdmin(admin.ModelAdmin):
    list_display = (
        "customer",
        "expires_at",
        "used_at",
        "requested_ip",
        "created_at",
    )
    list_filter = ("used_at",)
    search_fields = ("customer__email", "token")
    readonly_fields = (
        "customer",
        "token",
        "expires_at",
        "used_at",
        "requested_ip",
        "created_at",
    )

    def has_add_permission(self, request):  # pragma: no cover
        return False

    def has_change_permission(self, request, obj=None):  # pragma: no cover
        # Mutable through life-cycle, but never by hand from admin.
        return False


@admin.register(LoyaltySettings)
class LoyaltySettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "is_enabled",
        "points_per_currency_unit",
        "redemption_rate",
        "min_points_to_redeem",
        "points_expiry_days",
        "updated_at",
    )
    list_filter = ("is_enabled",)
    search_fields = ("organization__name", "organization__slug")
    readonly_fields = ("created_at", "updated_at")


@admin.register(LoyaltyTransaction)
class LoyaltyTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "customer",
        "organization",
        "type",
        "points",
        "order",
        "created_at",
    )
    list_filter = ("type", "organization")
    search_fields = ("customer__email", "note")
    readonly_fields = ("created_at",)
    autocomplete_fields = ("customer", "organization", "order")

    def has_add_permission(self, request):  # pragma: no cover
        # Transactions are created by services, not by hand.
        return False

    def has_change_permission(self, request, obj=None):  # pragma: no cover
        return False
