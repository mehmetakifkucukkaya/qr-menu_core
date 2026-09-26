"""Media upload endpoint — Sprint 5A.

POST /api/v1/admin/media/upload
    Body: multipart/form-data, "file=<binary>"
    Response: 201 {data: {url, filename, size, content_type}}

Validation rules:

* MIME whitelist: ``image/jpeg``, ``image/png``, ``image/webp``.
* Size cap: 5 MB.
* Filename extension whitelist: ``.jpg``, ``.jpeg``, ``.png``, ``.webp``.

Storage layout::

    MEDIA_ROOT/uploads/{organization_id}/{uuid4}-{sanitized_filename}

Returns the publicly-fetchable URL using ``settings.PUBLIC_BASE_URL``
plus ``MEDIA_URL`` (typically ``/media/uploads/<org_id>/<uuid>-<name>``).

Decisions:

* **Local storage only** (D-011). S3/R2 is V2; we don't reinvent the
  storage interface — Django's default file storage handles the disk
  write.
* **No DB model.** We don't persist an upload row — the URL embedded
  in ``MenuItem.image`` / ``ThemeConfig.logo`` / etc. is itself the
  reference. A future ``MediaAsset`` model (Sprint 6+) could capture
  upload timestamp, uploader, alt text, etc.
* **Tenant prefix in path.** Files live under
  ``uploads/{organization_id}/...`` so filesystem-level inspection by
  an operator shows the tenant boundary even though the metadata
  doesn't.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Membership
from apps.accounts.permissions import IsOrganizationMember
from apps.qr.utils import sanitize_filename


ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def _resolve_organization(user):
    """Same resolution used in admin summary — first active membership."""
    membership = Membership.objects.filter(
        user=user, organization__is_active=True
    ).first()
    return membership.organization if membership else None


class MediaUploadView(APIView):
    """POST /api/v1/admin/media/upload — multipart file upload."""

    permission_classes = [IsAuthenticated, IsOrganizationMember]
    # Multipart parsing is enabled by default in DRF; no parser override needed.

    def post(self, request: Request) -> Response:
        # 1) Resolve org (tenant prefix + access scope).
        organization = _resolve_organization(request.user)
        if organization is None:
            return Response(
                {
                    "error": {
                        "code": "media.no_organization",
                        "message": "Yükleme için bir işletmeye üye olmalısınız.",
                    }
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # 2) Pull the file out of the request.
        file = request.FILES.get("file")
        if file is None:
            return Response(
                {
                    "error": {
                        "code": "media.missing_file",
                        "message": "Form alanında 'file' zorunludur.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3) MIME type check.
        if file.content_type not in ALLOWED_MIME_TYPES:
            return Response(
                {
                    "error": {
                        "code": "media.invalid_type",
                        "message": "İzin verilen tipler: image/jpeg, image/png, image/webp.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4) Size check (cheap pre-check; chunked write protects against
        # a malicious client that lies about its Content-Length).
        if file.size is None or file.size > MAX_SIZE_BYTES:
            return Response(
                {
                    "error": {
                        "code": "media.too_large",
                        "message": "Dosya boyutu 5 MB sınırını aşıyor.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 5) Extension check.
        original_name = file.name or "upload"
        ext = Path(original_name).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            return Response(
                {
                    "error": {
                        "code": "media.invalid_extension",
                        "message": "İzin verilen uzantılar: .jpg, .jpeg, .png, .webp.",
                    }
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 6) Build the destination path.
        media_root = Path(settings.MEDIA_ROOT) / "uploads" / str(organization.id)
        media_root.mkdir(parents=True, exist_ok=True)

        safe_name = sanitize_filename(original_name)
        new_name = f"{uuid.uuid4().hex}-{safe_name}"
        dest_path = media_root / new_name

        # 7) Stream the upload to disk in chunks. ``file.chunks()`` already
        # reads in 2.5 MB chunks — limits peak memory.
        bytes_written = 0
        with open(dest_path, "wb") as out:
            for chunk in file.chunks():
                out.write(chunk)
                bytes_written += len(chunk)
                # Mid-stream safety: abort if we somehow exceed the cap
                # (e.g. client lied about Content-Length).
                if bytes_written > MAX_SIZE_BYTES:
                    out.close()
                    dest_path.unlink(missing_ok=True)
                    return Response(
                        {
                            "error": {
                                "code": "media.too_large",
                                "message": "Dosya boyutu 5 MB sınırını aşıyor.",
                            }
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        # 8) Compose the public URL the client will see. We host media at
        # PUBLIC_BASE_URL + MEDIA_URL; local dev returns an absolute URL
        # the backend itself serves (see ``static(settings.MEDIA_URL, ...)``
        # in DEBUG mode in config/urls.py).
        public_base = (
            getattr(settings, "PUBLIC_BASE_URL", "http://localhost:3000")
            or "http://localhost:3000"
        ).rstrip("/")
        public_url = (
            f"{public_base}{settings.MEDIA_URL}uploads/{organization.id}/{new_name}"
        )

        return Response(
            {
                "data": {
                    "url": public_url,
                    "filename": new_name,
                    "size": bytes_written,
                    "content_type": file.content_type,
                    "organization_id": organization.id,
                },
                "meta": {"request_id": request.META.get("HTTP_X_REQUEST_ID", "")},
            },
            status=status.HTTP_201_CREATED,
        )
