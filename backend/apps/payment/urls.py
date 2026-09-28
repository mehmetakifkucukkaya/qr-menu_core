"""Payment URL patterns — D-026 (Sprint 11A).

Public + admin + webhook routes. The webhook route uses a separate
function-style view because it must bypass DRF CSRF and parse the body
as raw bytes (for Stripe's HMAC-SHA256 signature).
"""

from __future__ import annotations

from django.urls import path

from .views import (
    AdminRefundListCreateView,
    CreateOrderPaymentView,
    OrderPaymentStatusPublicView,
    PaymentDashboardRedirectView,
    PaymentProviderTestAdminView,
    PaymentReconcileAdminView,
    PaymentSettingsAdminView,
    PaymentSettlementAdminView,
    PaymentWebhookEventDebugView,
    stripe_webhook_view,
)

urlpatterns = [
    # Public — no authentication, but order lookup is the cross-tenant
    # 404 guard. ``order_number`` is the tenant's natural identifier.
    path(
        "public/orders/<str:order_number>/pay/",
        CreateOrderPaymentView.as_view(),
        name="payment-create-intent",
    ),
    path(
        "public/orders/<str:order_number>/payment/",
        OrderPaymentStatusPublicView.as_view(),
        name="payment-public-status",
    ),
    # Webhook — Stripe callback receiver.
    path(
        "webhooks/<str:provider_name>/",
        stripe_webhook_view,
        name="payment-webhook-receiver",
    ),
    # Admin — settings, settlement, refunds, reconciliation.
    path(
        "admin/payment/settings/",
        PaymentSettingsAdminView.as_view(),
        name="payment-admin-settings",
    ),
    path(
        "admin/payment/settings/test/",
        PaymentProviderTestAdminView.as_view(),
        name="payment-admin-settings-test",
    ),
    path(
        "admin/payment/settlement/",
        PaymentSettlementAdminView.as_view(),
        name="payment-admin-settlement",
    ),
    path(
        "admin/payment/refunds/",
        AdminRefundListCreateView.as_view(),
        name="payment-admin-refunds",
    ),
    path(
        "admin/payment/reconcile/",
        PaymentReconcileAdminView.as_view(),
        name="payment-admin-reconcile",
    ),
    path(
        "admin/payment/webhook-events/",
        PaymentWebhookEventDebugView.as_view(),
        name="payment-admin-webhook-events",
    ),
    path(
        "admin/payment/",
        PaymentDashboardRedirectView.as_view(),
        name="payment-admin-dashboard",
    ),
]
