"""Public billing URL patterns (Sprint B3).

Mounted by ``config.urls`` under ``/api/v1/public/``::

    GET /api/v1/public/settings/<slug>/  → tenant-safe feature flags
"""

from django.urls import path

from .views import PublicSettingsView

urlpatterns = [
    path(
        "settings/<slug:slug>/",
        PublicSettingsView.as_view(),
        name="public-billing-settings",
    ),
]
