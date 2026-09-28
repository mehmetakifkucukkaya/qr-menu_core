"""Admin URL patterns for the account app — Sprint 10A (D-025).

Mounted by ``config/urls`` under ``/api/v1/account/admin/``::

    GET   /api/v1/account/admin/customers
    GET   /api/v1/account/admin/customers/{id}
    POST  /api/v1/account/admin/customers/{id}/loyalty-adjust
    GET   /api/v1/account/admin/loyalty/settings
    PUT   /api/v1/account/admin/loyalty/settings

Split into a separate module so config/urls.py can mount admin and
public surfaces under two different prefixes without twice-importing
``apps.account.urls``.
"""

from django.urls import path

from .views import (
    AdminCustomerDetailView,
    AdminCustomerListView,
    AdminLoyaltyAdjustView,
    AdminLoyaltySettingsView,
)


urlpatterns = [
    path(
        "customers",
        AdminCustomerListView.as_view(),
        name="account-admin-customers-list",
    ),
    path(
        "customers/<int:pk>",
        AdminCustomerDetailView.as_view(),
        name="account-admin-customers-detail",
    ),
    path(
        "customers/<int:pk>/loyalty-adjust",
        AdminLoyaltyAdjustView.as_view(),
        name="account-admin-customers-loyalty-adjust",
    ),
    path(
        "loyalty/settings",
        AdminLoyaltySettingsView.as_view(),
        name="account-admin-loyalty-settings",
    ),
]
