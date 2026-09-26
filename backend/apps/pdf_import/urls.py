"""URL patterns for the PDF import app — Sprint 7A (D-021).

Mounted by ``config/urls`` under ``/api/v1/admin/pdf-import/``::

    POST    /upload/                       — multipart PDF → AI parse → draft
    GET     /drafts/                       — recent drafts
    GET     /drafts/<pk>/                  — full draft + items
    POST    /drafts/<pk>/confirm/          — bulk save to Menu/Category/Item
    DELETE  /drafts/<pk>/discard/          — mark discarded
    PATCH   /items/<pk>/                   — inline-edit a parsed item
"""

from django.urls import path

from . import views

urlpatterns = [
    path(
        "upload/",
        views.PdfUploadView.as_view(),
        name="pdf-import-upload",
    ),
    path(
        "drafts/",
        views.PdfImportDraftsView.as_view(),
        name="pdf-import-drafts",
    ),
    path(
        "drafts/<int:pk>/",
        views.PdfImportDraftDetailView.as_view(),
        name="pdf-import-draft-detail",
    ),
    path(
        "drafts/<int:pk>/confirm/",
        views.PdfImportConfirmView.as_view(),
        name="pdf-import-confirm",
    ),
    path(
        "drafts/<int:pk>/discard/",
        views.PdfImportDiscardView.as_view(),
        name="pdf-import-discard",
    ),
    path(
        "items/<int:pk>/",
        views.PdfImportItemUpdateView.as_view(),
        name="pdf-import-item-update",
    ),
]