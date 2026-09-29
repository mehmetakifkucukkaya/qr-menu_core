"""Image processing pipeline — Sprint E1 (D-033).

V1 implementation: Pillow resize + thumbnail generation.

* :func:`process_image` — main entry point. Resizes to fit within
  ``max_dimensions`` while preserving aspect ratio, optionally
  generates a 400x400 thumbnail. Returns a dict with the new
  width/height + thumbnail key.

* :func:`generate_thumbnail_key` — derives the thumbnail path from
  the original storage key (appends ``.thumb.{ext}``).

V2 SaaS feature: AVIF/WebP transcoding, CDN image resizer
(Cloudflare Images, Imgix). V1 keeps JPEG/PNG only — Pillow ships
with both as built-in formats.
"""

from __future__ import annotations

import io
import os
from typing import Optional

from PIL import Image, ImageOps


THUMBNAIL_MAX = (400, 400)
JPEG_QUALITY = 80
PNG_OPTIMIZE = True


def generate_thumbnail_key(storage_key: str) -> str:
    """``tenants/foo/image/abc.jpg`` → ``tenants/foo/image/abc.thumb.jpg``"""
    base, ext = os.path.splitext(storage_key)
    return f"{base}.thumb{ext}"


def process_image(
    file_obj,
    *,
    max_dimensions: tuple[int, int] = (1920, 1080),
    generate_thumbnail: bool = True,
) -> dict:
    """Resize the uploaded image to fit within ``max_dimensions`` (preserving
    aspect ratio) and return a Pillow ``Image`` plus metadata.

    Returns ``{"image": Image, "width": int, "height": int, "thumbnail": Image | None}``.

    Caller writes the processed image back to storage via
    :func:`apps.media.storage.get_storage_backend`.
    """
    img = Image.open(file_obj)
    img = ImageOps.exif_transpose(img)  # Honor EXIF orientation
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    img.thumbnail(max_dimensions, Image.Resampling.LANCZOS)
    width, height = img.size

    thumbnail = None
    if generate_thumbnail:
        thumb = img.copy()
        thumb.thumbnail(THUMBNAIL_MAX, Image.Resampling.LANCZOS)
        thumbnail = thumb

    return {"image": img, "width": width, "height": height, "thumbnail": thumbnail}


def save_processed_image(img, storage_backend, key: str, content_type: str) -> str:
    """Encode ``img`` to bytes and persist via the storage backend."""
    buf = io.BytesIO()
    if content_type == "image/png":
        img.save(buf, format="PNG", optimize=PNG_OPTIMIZE)
    else:
        # Default to JPEG
        img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    buf.seek(0)
    buf.name = os.path.basename(key)
    return storage_backend.save(buf, key, content_type)
