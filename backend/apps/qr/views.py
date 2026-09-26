"""QR code admin endpoints — Sprint 5A.

* CRUD + soft delete via ``QRCodeViewSet``.
* PNG download via ``QRCodeDownloadView`` — returns ``image/png`` directly,
  no JSON envelope; the download URL is what the printed label prints.

Conventions match the rest of the codebase:

* ``{data, meta}`` envelope on every JSON response.
* Tenant isolation via ``IsOrganizationMember`` + ``.for_user(user)`` queryset.
* Soft-delete: ``DELETE`` flips ``is_active=False`` rather than removing the row.
"""

from __future__ import annotations

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsOrganizationMember

from .models import QRCode
from .serializers import QRCodeSerializer
from .utils import generate_qr_png


def _wrap(data, request: Request) -> Response:
    return Response(
        {
            "data": data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        }
    )


def _wrap_response(response: Response, request: Request) -> Response:
    return Response(
        {
            "data": response.data,
            "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
        },
        status=response.status_code,
        headers={
            k: v
            for k, v in response.headers.items()
            if k.lower() not in {"content-type", "content-length"}
        },
    )


class QRCodeViewSet(viewsets.ModelViewSet):
    """CRUD for QR codes the current user can access."""

    serializer_class = QRCodeSerializer
    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get_queryset(self):
        return (
            QRCode.objects.for_user(self.request.user)
            .select_related("organization", "menu", "branch")
            .order_by("organization__name", "-created_at")
        )

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        if page is not None:
            data = self.get_serializer(page, many=True).data
            return _wrap(
                {
                    "count": self.paginator.page.paginator.count,
                    "next": self.paginator.get_next_link(),
                    "previous": self.paginator.get_previous_link(),
                    "results": data,
                },
                request,
            )
        data = self.get_serializer(self.get_queryset(), many=True).data
        return _wrap(
            {"count": len(data), "next": None, "previous": None, "results": data},
            request,
        )

    def retrieve(self, request, *args, **kwargs):
        response = super().retrieve(request, *args, **kwargs)
        return _wrap(response.data, request)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        return _wrap_response(response, request)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        return _wrap_response(response, request)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, partial=True, **kwargs)

    def destroy(self, request, *args, **kwargs):
        # Soft delete: flip is_active to False instead of removing the row,
        # which preserves the scan_count history (analytics still references it).
        instance = self.get_object()
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class QRCodeDownloadView(APIView):
    """GET /api/v1/admin/qr-codes/{id}/download — ``image/png`` stream.

    The PNG is generated on-the-fly from ``target_url`` using
    ``qrcode[pil]``. Clients typically use ``Content-Disposition: attachment``
    to surface the browser save dialog; for ``<img src=...>`` (admin preview
    page) the same endpoint serves the inline payload.
    """

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request, pk: int) -> HttpResponse:
        qr_code = get_object_or_404(
            QRCode.objects.for_user(request.user),
            pk=pk,
        )
        png_bytes = generate_qr_png(qr_code.target_url)
        response = HttpResponse(png_bytes, content_type="image/png")
        # Filename hint for browser save / preview tools.
        response["Content-Disposition"] = (
            f'inline; filename="qr-{qr_code.id}.png"'
        )
        response["Content-Length"] = str(len(png_bytes))
        return response
