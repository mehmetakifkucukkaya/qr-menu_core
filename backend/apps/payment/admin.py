"""Payment app Django admin — D-026 (Sprint 11A).

The admin surface is read-mostly — admin staff don't directly create
payments or issue refunds (those flows live in the SPA UI). Settings
CRUD via DRF API at ``/api/v1/admin/payment/settings/`` is the
canonical write path.
"""

from django.contrib import admin

from .models import OrderPayment, PaymentSettings, RefundRecord, WebhookEvent


@admin.register(PaymentSettings)
class PaymentSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organization",
        "provider_name",
        "is_enabled",
        "is_test_mode",
        "updated_at",
    )
    list_filter = ("provider_name", "is_enabled", "is_test_mode")
    search_fields = ("organization__name", "organization__slug")
    # Sensitive fields NEVER shown in the admin form.
    exclude = ("api_key_encrypted", "webhook_secret_encrypted")


@admin.register(OrderPayment)
class OrderPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "order",
        "organization",
        "provider_name",
        "provider_payment_status",
        "amount",
        "currency",
        "paid_at",
    )
    list_filter = ("provider_name", "provider_payment_status", "currency")
    search_fields = ("order__order_number", "provider_payment_id")
    readonly_fields = (
        "provider_payment_id",
        "provider_payment_status",
        "paid_at",
        "raw_response",
        "created_at",
        "updated_at",
    )


@admin.register(RefundRecord)
class RefundRecordAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "payment",
        "order",
        "organization",
        "amount",
        "reason",
        "status",
        "initiated_by",
        "created_at",
    )
    list_filter = ("reason", "status")
    search_fields = (
        "provider_refund_id",
        "order__order_number",
    )
    readonly_fields = ("provider_refund_id", "created_at", "updated_at")


@admin.register(WebhookEvent)
class WebhookEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "provider_name",
        "provider_event_id",
        "received_at",
        "processed",
    )
    list_filter = ("provider_name", "processed")
    search_fields = ("provider_event_id",)
    readonly_fields = (
        "provider_name",
        "provider_event_id",
        "payload",
        "received_at",
        "processed",
        "error",
    )
