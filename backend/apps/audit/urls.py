"""URL patterns for the audit app — Sprint 4C.

Mounted by ``config/urls`` under ``/api/v1/admin/`` (next to the
menu / branch / theme / organization routers).
"""

from django.urls import path

from .views import AdminSummaryView

urlpatterns = [
    path("summary", AdminSummaryView.as_view(), name="admin-summary"),
]
