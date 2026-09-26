"""Django admin registration for orders (Sprint 8A).

The admin view is read-mostly for ops / debug visibility. Lifecycle
changes should go through the API so the audit log captures them. The
timestamp fields are explicitly ``readonly_fields`` to prevent
manual drift from the transition state machine.
"""

from __future__ import annotations

from django.contrib import admin

from .models import Order, OrderItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    autocomplete_fields = ("menu_item",)
    readonly_fields = ("name", "price", "quantity", "notes")
    fields = ("name", "menu_item", "price", "quantity", "notes")
    can_delete = False

    def has_add_permission(self, request, obj=None):  # pragma: no cover
        # Lines are created at order placement time via the public API.
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "organization",
        "branch",
        "status",
        "customer_name",
        "customer_phone",
        "total_amount",
        "currency",
        "placed_at",
    )
    list_filter = ("status", "placed_at", "organization")
    search_fields = ("order_number", "customer_name", "customer_phone", "notes")
    autocomplete_fields = ("organization", "branch", "menu")
    readonly_fields = (
        "order_number",
        "total_amount",
        "currency",
        "placed_at",
        "confirmed_at",
        "preparing_at",
        "ready_at",
        "delivered_at",
        "cancelled_at",
        "created_at",
        "updated_at",
        "metadata",
    )
    inlines = [OrderItemInline]

    def has_add_permission(self, request):  # pragma: no cover
        # Orders are created through the public API, not Django admin.
        return False
