"""MediaAsset views — Sprint E1 (D-033).

* ``POST /api/v1/admin/media/upload/`` — multipart upload, creates a
  ``MediaAsset`` row (with image processing + thumbnail generation).
* ``GET  /api/v1/admin/media/``        — paginated list of tenant assets.
* ``DELETE /api/v1/admin/media/<id>/`` — soft-delete (is_active=False).

Tenant isolation mirrors the existing ``MediaUploadView`` (Sprint 5A).
The new endpoints use the ``MediaAsset`` model — they coexist with
the legacy upload view, which is kept for backward compatibility
(V1 demo clients may still hit ``/admin/media/upload``).
"""

from __future__ import annotations

import logging

from django.db.models import Q
from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember

from .models import MediaAsset, MediaKind
from .processing import generate_thumbnail_key, process_image, save_processed_image
from .serializers import MediaAssetSerializer
from .storage import build_storage_key, get_storage_backend
from .views import _resolve_organization


logger = logging.getLogger(__name__)


# Reuse the existing validation rules (5 MB cap, image MIME whitelist).
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _audit_event(organization, action: str, asset: MediaAsset):
    try:
        from apps.audit.services import record_event

        record_event(
            organization=organization,
            action=action,
            target_type="media_asset",
            target_id=asset.id,
            target_repr=f"MediaAsset<{asset.id}:{asset.original_filename}>",
            payload={
                "kind": asset.kind,
                "size_bytes": asset.size_bytes,
                "content_type": asset.content_type,
            },
        )
    except Exception:  # noqa: BLE001
        pass


# ---------------------------------------------------------------------------
# Upload (creates MediaAsset)
# ---------------------------------------------------------------------------


class MediaAssetUploadView(APIView):
    """``POST /api/v1/admin/media/upload/`` — multipart upload, MediaAsset."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def post(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {"error": {"code": "media.no_organization", "message": "Yükleme için bir işletmeye üye olmalısınız."}},
                status=status.HTTP_403_FORBIDDEN,
            )

        file = request.FILES.get("file")
        if file is None:
            return Response(
                {"error": {"code": "media.missing_file", "message": "Form alanında 'file' zorunludur."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        content_type = (file.content_type or "").lower()
        if content_type not in ALLOWED_MIME_TYPES:
            return Response(
                {"error": {"code": "media.unsupported_type", "message": f"Desteklenmeyen MIME: {content_type}"}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if file.size > MAX_SIZE_BYTES:
            return Response(
                {"error": {"code": "media.too_large", "message": f"Dosya 5 MB'dan büyük olamaz."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Storage backend factory — local or S3.
        storage = get_storage_backend()
        original_key = build_storage_key(organization.slug, MediaKind.IMAGE, file.name)
        thumb_key = generate_thumbnail_key(original_key)

        # Image processing pipeline (Pillow resize + thumbnail).
        try:
            processed = process_image(file, max_dimensions=(1920, 1080), generate_thumbnail=True)
        except Exception as exc:
            logger.warning("Image processing failed: %s", exc)
            return Response(
                {"error": {"code": "media.processing_failed", "message": "Görsel işlenemedi."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Persist processed image + thumbnail.
        public_url = save_processed_image(processed["image"], storage, original_key, content_type)
        thumb_url = ""
        if processed["thumbnail"] is not None:
            thumb_url = save_processed_image(
                processed["thumbnail"], storage, thumb_key, "image/jpeg"
            )

        # Create MediaAsset row.
        asset = MediaAsset.objects.create(
            organization=organization,
            kind=MediaKind.IMAGE,
            original_filename=file.name,
            content_type=content_type,
            size_bytes=file.size,
            storage_key=original_key,
            public_url=public_url,
            width=processed["width"],
            height=processed["height"],
            thumbnail_key=thumb_key,
            thumbnail_url=thumb_url,
            alt_text=request.data.get("alt_text", "")[:300],
            uploaded_by=request.user,
            is_active=True,
        )
        _audit_event(organization, "media_uploaded", asset)

        return Response(
            {"data": MediaAssetSerializer(asset).data, "meta": {}},
            status=status.HTTP_201_CREATED,
        )


# ---------------------------------------------------------------------------
# List / detail / soft-delete
# ---------------------------------------------------------------------------


class MediaAssetListView(APIView):
    """``GET /api/v1/admin/media/`` — paginated tenant asset list."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def get(self, request: Request) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {"error": {"code": "media.no_organization", "message": "İşletme bulunamadı."}},
                status=status.HTTP_403_FORBIDDEN,
            )

        kind = request.query_params.get("kind")
        q = Q(organization=organization, is_active=True)
        if kind:
            q &= Q(kind=kind)
        assets = MediaAsset.objects.filter(q).order_by("-created_at")[:100]
        return Response(
            {"data": MediaAssetSerializer(assets, many=True).data, "meta": {"count": len(assets)}},
        )


class MediaAssetDeleteView(APIView):
    """``DELETE /api/v1/admin/media/<id>/`` — soft-delete."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]

    def delete(self, request: Request, asset_id: int) -> Response:
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {"error": {"code": "media.no_organization", "message": "İşletme bulunamadı."}},
                status=status.HTTP_403_FORBIDDEN,
            )
        try:
            asset = MediaAsset.objects.get(id=asset_id, organization=organization)
        except MediaAsset.DoesNotExist as exc:
            raise NotFound(
                detail={"error": {"code": "media.not_found", "message": "Medya bulunamadı."}}
            ) from exc

        asset.is_active = False
        asset.save(update_fields=["is_active", "updated_at"])
        _audit_event(organization, "media_deleted", asset)
        return Response(status=status.HTTP_204_NO_CONTENT)
