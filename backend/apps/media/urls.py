"""URL patterns for the media upload app.

Mounted by ``config/urls`` under ``/api/v1/admin/media/``::

    POST /api/v1/admin/media/upload
"""

from django.urls import path

from .views import MediaUploadView


urlpatterns = [
    path("upload", MediaUploadView.as_view(), name="media-upload"),
]
