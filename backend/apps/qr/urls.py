"""URL patterns for the QR code app — Sprint 5A.

Mounted by ``config/urls`` under ``/api/v1/admin/``::

    GET/POST/PATCH/DEL  /api/v1/admin/qr-codes/        (router)
    GET                 /api/v1/admin/qr-codes/{id}/download  (PNG)

The router is registered against the literal ``qr-codes`` prefix so
detail URLs follow the project's existing ``/menus/<pk>/`` pattern.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import QRCodeDownloadView, QRCodeViewSet

router = DefaultRouter()
router.register(r"qr-codes", QRCodeViewSet, basename="qr-code")

urlpatterns = router.urls + [
    path(
        "qr-codes/<int:pk>/download",
        QRCodeDownloadView.as_view(),
        name="qr-code-download",
    ),
]
