"""URL patterns for the media upload app.

Mounted by ``config/urls`` under ``/api/v1/admin/media/``::

    POST   /api/v1/admin/media/upload            → legacy MediaUploadView (Sprint 5A)
    POST   /api/v1/admin/media/upload/           → new MediaAssetUploadView (Sprint E1)
    GET    /api/v1/admin/media/                   → MediaAssetListView
    DELETE /api/v1/admin/media/<id>/              → MediaAssetDeleteView
"""

from django.urls import path

from .views import MediaUploadView
from .views_mediaasset import (
    MediaAssetDeleteView,
    MediaAssetListView,
    MediaAssetUploadView,
)


urlpatterns = [
    # Legacy (Sprint 5A) — kept for backward compatibility, returns just the URL.
    path("upload", MediaUploadView.as_view(), name="media-upload"),
    # Sprint E1 — MediaAsset pipeline (upload + list + delete).
    path("upload/", MediaAssetUploadView.as_view(), name="media-asset-upload"),
    path("", MediaAssetListView.as_view(), name="media-asset-list"),
    path("<int:asset_id>/", MediaAssetDeleteView.as_view(), name="media-asset-delete"),
]
