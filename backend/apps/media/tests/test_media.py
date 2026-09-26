"""Media upload API tests — Sprint 5A.

Covers:

* jpeg/png/webp uploads succeed (small payload).
* Disallowed MIME types rejected with 400 + ``media.invalid_type``.
* Oversized files rejected with 400 + ``media.too_large``.
* Files land under ``MEDIA_ROOT/uploads/{org_id}/...`` with a UUID prefix.
* Anonymous users get 403.
"""

from __future__ import annotations

import io
import os

import pytest
from django.conf import settings
from PIL import Image
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa3\x05\xfb\x00\x00"
    b"\x00\x00IEND\xaeB`\x82"
)


def _make_png_bytes() -> bytes:
    """Build a minimal valid PNG using Pillow."""
    img = Image.new("RGB", (4, 4), color=(10, 20, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_jpeg_bytes() -> bytes:
    img = Image.new("RGB", (4, 4), color=(40, 50, 60))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_webp_bytes() -> bytes:
    img = Image.new("RGB", (4, 4), color=(70, 80, 90))
    buf = io.BytesIO()
    img.save(buf, format="WEBP")
    return buf.getvalue()


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def _upload(client, *, contents, content_type, filename):
    from django.core.files.uploadedfile import SimpleUploadedFile

    f = SimpleUploadedFile(filename, contents, content_type=content_type)
    return client.post(
        "/api/v1/admin/media/upload",
        data={"file": f},
        format="multipart",
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_media_upload_jpeg_succeeds(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = _upload(
        api_client,
        contents=_make_jpeg_bytes(),
        content_type="image/jpeg",
        filename="logo.jpg",
    )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert payload["content_type"] == "image/jpeg"
    assert payload["filename"].endswith(".jpg")
    assert payload["size"] > 0
    assert payload["url"].endswith(f".jpg")
    assert f"/uploads/{org_a.id}/" in payload["url"]


def test_media_upload_png_succeeds(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = _upload(
        api_client,
        contents=_make_png_bytes(),
        content_type="image/png",
        filename="cover.png",
    )
    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["content_type"] == "image/png"
    assert payload["filename"].endswith(".png")


def test_media_upload_webp_succeeds(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = _upload(
        api_client,
        contents=_make_webp_bytes(),
        content_type="image/webp",
        filename="cover.webp",
    )
    assert response.status_code == 201
    payload = response.json()["data"]
    assert payload["content_type"] == "image/webp"
    assert payload["filename"].endswith(".webp")


def test_media_upload_invalid_mime_returns_400(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = _upload(
        api_client,
        contents=b"not really a pdf",
        content_type="application/pdf",
        filename="evil.pdf",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "media.invalid_type"


def test_media_upload_too_large_returns_400(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    # 5 MB + 1 byte dummy payload — we lie about the MIME so we hit the
    # size check before the MIME check… actually the order in the view
    # is MIME → size. So use a valid PNG MIME but oversized content
    # (anything bigger than 5 MB).
    big_content = b"\x00" * (5 * 1024 * 1024 + 16)
    response = _upload(
        api_client,
        contents=big_content,
        content_type="image/png",
        filename="huge.png",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "media.too_large"


def test_media_upload_stores_in_org_subdirectory(api_client, org_a):
    """Files land in MEDIA_ROOT/uploads/{org_id}/ with a UUID prefix."""
    _login(api_client, "owner-a@example.com")
    response = _upload(
        api_client,
        contents=_make_png_bytes(),
        content_type="image/png",
        filename="my-cool.png",
    )
    assert response.status_code == 201
    payload = response.json()["data"]
    # Find the file on disk.
    filename = payload["filename"]
    expected_path = (
        settings.MEDIA_ROOT / "uploads" / str(org_a.id) / filename
    )
    assert expected_path.exists(), f"expected upload at {expected_path}"

    # Cleanup — keep the test directory tidy.
    expected_path.unlink(missing_ok=True)


def test_media_upload_anonymous_returns_403(api_client):
    client = APIClient()  # no login
    response = _upload(
        client,
        contents=_make_png_bytes(),
        content_type="image/png",
        filename="anon.png",
    )
    assert response.status_code in (401, 403)


def test_media_upload_no_file_returns_400(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/media/upload",
        data={},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "media.missing_file"


def test_media_upload_invalid_extension_returns_400(api_client, org_a):
    """Extension check is independent of MIME; an SVG masquerading as
    image/png gets caught here."""
    _login(api_client, "owner-a@example.com")
    response = _upload(
        api_client,
        contents=b"<svg></svg>",
        content_type="image/png",
        filename="evil.svg",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "media.invalid_extension"
