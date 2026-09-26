"""URL patterns for admin analytics endpoints.

Mounted by ``config/urls`` under ``/api/v1/admin/analytics/``::

    GET /api/v1/admin/analytics/overview
"""

from django.urls import path

from .views_admin import AnalyticsOverviewView


urlpatterns = [
    path("overview", AnalyticsOverviewView.as_view(), name="analytics-overview"),
]
