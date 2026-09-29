"""Billing URL patterns — Sprint B1 (D-026).

Mounted by ``config/urls`` under ``/api/v1/admin/billing/``::

    GET  /api/v1/admin/billing/plan/                          → current
    GET  /api/v1/admin/billing/usage/                         → snapshot
    GET  /api/v1/admin/billing/limits/                        → matrix
    POST /api/v1/admin/billing/limits/preview-upgrade/        → diff
    POST /api/v1/admin/billing/reset-usage/                   → superuser
"""

from django.urls import path

from .views import (
    BillingLimitsAdminView,
    BillingPlanAdminView,
    BillingPreviewUpgradeAdminView,
    BillingResetUsageAdminView,
    BillingUsageAdminView,
)

urlpatterns = [
    path("plan/", BillingPlanAdminView.as_view(), name="billing-admin-plan"),
    path("usage/", BillingUsageAdminView.as_view(), name="billing-admin-usage"),
    path("limits/", BillingLimitsAdminView.as_view(), name="billing-admin-limits"),
    path(
        "limits/preview-upgrade/",
        BillingPreviewUpgradeAdminView.as_view(),
        name="billing-admin-preview-upgrade",
    ),
    path(
        "reset-usage/",
        BillingResetUsageAdminView.as_view(),
        name="billing-admin-reset-usage",
    ),
]