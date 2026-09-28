"""Customer-account URL patterns — Sprint 10A (D-025).

Mounted by ``config/urls`` under ``/api/v1/account/``::

    POST  /api/v1/account/auth/request-link
    GET   /api/v1/account/auth/verify
    POST  /api/v1/account/auth/logout
    GET   /api/v1/account/me
    PATCH /api/v1/account/me
    GET   /api/v1/account/me/orders
    GET   /api/v1/account/me/loyalty
    GET   /api/v1/account/loyalty/settings

Admin endpoints live in ``apps.account.urls_admin`` and are mounted
under the separate ``/api/v1/account/admin/`` prefix.
"""

from django.urls import path

from .views import (
    CustomerLoyaltyView,
    CustomerLogoutView,
    CustomerMeView,
    CustomerOrderHistoryView,
    MagicLinkRequestView,
    MagicLinkVerifyView,
    PublicLoyaltySettingsView,
)


urlpatterns = [
    # Auth flow.
    path(
        "auth/request-link",
        MagicLinkRequestView.as_view(),
        name="account-request-link",
    ),
    path(
        "auth/verify",
        MagicLinkVerifyView.as_view(),
        name="account-verify",
    ),
    path(
        "auth/logout",
        CustomerLogoutView.as_view(),
        name="account-logout",
    ),
    # Customer profile + history (cookie session required).
    path(
        "me",
        CustomerMeView.as_view(),
        name="account-me",
    ),
    path(
        "me/orders",
        CustomerOrderHistoryView.as_view(),
        name="account-me-orders",
    ),
    path(
        "me/loyalty",
        CustomerLoyaltyView.as_view(),
        name="account-me-loyalty",
    ),
    # Public loyalty settings (tenant-aware banner adım için).
    path(
        "loyalty/settings",
        PublicLoyaltySettingsView.as_view(),
        name="account-loyalty-settings-public",
    ),
]
