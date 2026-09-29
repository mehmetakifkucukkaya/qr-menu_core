"""Sprint E1 — MediaAsset tests (D-033).

Covers:

* :func:`build_storage_key` — tenant isolation prefix + UUID.
* ``MediaAsset`` create via service path (skip HTTP for now).
* Image processing — resize + thumbnail dimensions.
* Storage backend factory — local default, S3 raises without install.
* Tenant isolation — different orgs get different prefixes.
"""

from __future__ import annotations

import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.media.models import MediaAsset, MediaKind
from apps.media.processing import (
    generate_thumbnail_key,
    process_image,
    save_processed_image,
)
from apps.media.storage import (
    LocalStorageBackend,
    S3StorageBackend,
    build_storage_key,
    get_storage_backend,
    reset_storage_backend_cache,
)


pytestmark = pytest.mark.django_db


def _make_test_image(width: int = 1200, height: int = 800, fmt: str = "JPEG") -> io.BytesIO:
    """Build an in-memory Pillow image for upload simulation."""
    img = Image.new("RGB", (width, height), color="red")
    buf = io.BytesIO()
    img.save(buf, format=fmt)
    buf.seek(0)
    buf.name = f"test.{fmt.lower()}"
    return buf


# ---------------------------------------------------------------------------
# Storage key builder
# ---------------------------------------------------------------------------


def test_build_storage_key_uses_tenant_prefix():
    key = build_storage_key("modern-cafe", "image", "logo.png")
    assert key.startswith("tenants/modern-cafe/image/")
    assert key.endswith(".png")
    # UUID length = 32 hex chars between prefix and ext.
    parts = key.split("/")
    filename = parts[-1]
    stem, _, _ = filename.partition(".")
    assert len(stem) == 32


def test_build_storage_key_handles_no_extension():
    key = build_storage_key("demo", "image", "logo")
    assert key.startswith("tenants/demo/image/")
    # No extension → no trailing "."
    assert "." not in key.split("/")[-1]


def test_build_storage_key_different_orgs_isolated():
    k1 = build_storage_key("cafe-a", "image", "x.jpg")
    k2 = build_storage_key("cafe-b", "image", "x.jpg")
    assert k1.split("/")[1] != k2.split("/")[1]


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------


def test_process_image_resizes_large_to_fit_max():
    """A 4000x3000 image should be resized to fit within 1920x1080.

    Pillow's ``thumbnail()`` shrinks until BOTH dims are <= max, preserving
    aspect ratio. 4000x3000 → ratio 4:3 → with max 1920x1080 the limiting
    factor is height 1080 (which yields width 1440).
    """
    img = _make_test_image(width=4000, height=3000)
    processed = process_image(img, max_dimensions=(1920, 1080), generate_thumbnail=True)
    assert processed["width"] <= 1920
    assert processed["height"] <= 1080
    # 4000x3000 → height 1080 (limiting) → width 1440 (4:3 aspect).
    assert processed["width"] == 1440
    assert processed["height"] == 1080
    assert processed["thumbnail"] is not None


def test_process_image_generates_thumbnail():
    img = _make_test_image(width=2000, height=1500)
    processed = process_image(img, max_dimensions=(1920, 1080), generate_thumbnail=True)
    thumb = processed["thumbnail"]
    assert thumb is not None
    assert thumb.size[0] <= 400
    assert thumb.size[1] <= 400


def test_generate_thumbnail_key_appends_suffix():
    key = "tenants/foo/image/abc123.jpg"
    assert generate_thumbnail_key(key) == "tenants/foo/image/abc123.thumb.jpg"


# ---------------------------------------------------------------------------
# Storage backend factory
# ---------------------------------------------------------------------------


def test_get_storage_backend_defaults_to_local(settings):
    reset_storage_backend_cache()
    settings.MEDIA_STORAGE_BACKEND = "local"
    backend = get_storage_backend()
    assert isinstance(backend, LocalStorageBackend)


def test_get_storage_backend_singleton_caches(settings):
    reset_storage_backend_cache()
    settings.MEDIA_STORAGE_BACKEND = "local"
    a = get_storage_backend()
    b = get_storage_backend()
    assert a is b


def test_s3_backend_raises_helpful_error_without_django_storages(settings):
    """S3 backend imports django-storages lazily; missing package should
    give a clear error (not a stack trace)."""
    import importlib
    import sys

    # Hide django-storages if present so we can prove the error path.
    settings.MEDIA_STORAGE_BACKEND = "s3"
    reset_storage_backend_cache()
    try:
        sys.modules["storages"] = None  # force ImportError
        with pytest.raises(RuntimeError, match="django-storages"):
            importlib.import_module("apps.media.storage")
            get_storage_backend()
    finally:
        sys.modules.pop("storages", None)
        reset_storage_backend_cache()


# ---------------------------------------------------------------------------
# Save pipeline
# ---------------------------------------------------------------------------


def test_save_processed_image_round_trip(tmp_path, settings):
    """Image flows through the resize → save → re-open pipeline."""
    reset_storage_backend_cache()
    settings.MEDIA_ROOT = tmp_path
    settings.MEDIA_STORAGE_BACKEND = "local"

    img = _make_test_image(width=800, height=600)
    processed = process_image(img, max_dimensions=(1920, 1080), generate_thumbnail=False)
    backend = get_storage_backend()
    url = save_processed_image(processed["image"], backend, "tenants/test/image/x.jpg", "image/jpeg")
    assert url.endswith("/media/tenants/test/image/x.jpg")
    # File exists on disk.
    assert (tmp_path / "tenants/test/image/x.jpg").exists()


# ---------------------------------------------------------------------------
# MediaAsset row (model level)
# ---------------------------------------------------------------------------


def test_mediaasset_create_with_tenant_isolation(org_a, admin_user):
    asset = MediaAsset.objects.create(
        organization=org_a,
        kind=MediaKind.IMAGE,
        original_filename="logo.png",
        content_type="image/png",
        size_bytes=1234,
        storage_key="tenants/cafe-a/image/abc.png",
        public_url="/media/tenants/cafe-a/image/abc.png",
        width=800,
        height=600,
        uploaded_by=admin_user,
        is_active=True,
    )
    asset.refresh_from_db()
    assert asset.organization_id == org_a.id
    assert asset.is_active is True
    assert asset.uploaded_by_id == admin_user.id


def test_mediaasset_soft_delete(org_a):
    asset = MediaAsset.objects.create(
        organization=org_a,
        kind=MediaKind.IMAGE,
        original_filename="x.png",
        content_type="image/png",
        size_bytes=100,
        storage_key="k",
        public_url="u",
        is_active=True,
    )
    asset.is_active = False
    asset.save()
    assert MediaAsset.objects.filter(id=asset.id, is_active=False).exists()
    assert MediaAsset.objects.filter(id=asset.id, is_active=True).count() == 0
