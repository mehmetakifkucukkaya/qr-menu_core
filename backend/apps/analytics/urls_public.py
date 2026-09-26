"""URL patterns for public analytics endpoints.

Mounted by ``config/urls`` under ``/api/v1/public/``::

    POST /api/v1/public/events
"""

from django.urls import path

from .views_public import PublicEventsView


urlpatterns = [
    path("events", PublicEventsView.as_view(), name="public-events"),
]
