"""Storage backend abstraction — Sprint E1 (D-033).

Pluggable storage backends for tenant-isolated media uploads.

* :class:`LocalStorageBackend` — dev/demo default. Writes to
  ``settings.MEDIA_ROOT`` under the tenant path. Served by Django
  dev server's static() helper in DEBUG mode, or nginx in prod.

* :class:`S3StorageBackend` — production. Uses
  ``django-storages[boto3]`` for AWS S3 / Cloudflare R2 (R2 is S3-
  compatible with a custom endpoint URL). CDN-friendly via
  ``MEDIA_PUBLIC_BASE_URL`` override (e.g. CloudFront / R2 public
  dev URL).

* :func:`get_storage_backend` — factory, reads
  ``settings.MEDIA_STORAGE_BACKEND`` (``local`` or ``s3``).

The backend exposes a minimal API surface so the upload view doesn't
care which one is in use:

* :meth:`save(file_obj, key, content_type) -> str` — write file,
  return public URL
* :meth:`delete(key) -> None` — remove file
* :meth:`url_for(key) -> str` — public URL (CDN-aware)

Tenant isolation: every key starts with ``tenants/{org_slug}/`` —
:class:`MediaAsset` saves the full key, ``storage_key`` never
trusts user input (computed in :func:`build_storage_key`).
"""

from __future__ import annotations

import os
import uuid
from typing import Protocol

from django.conf import settings
from django.core.files.storage import default_storage


class StorageBackend(Protocol):
    """Minimal storage interface — both backends implement this."""

    def save(self, file_obj, key: str, content_type: str) -> str:
        """Persist ``file_obj`` at ``key``. Return the public URL."""
        ...

    def delete(self, key: str) -> None:
        ...

    def url_for(self, key: str) -> str:
        ...


# ---------------------------------------------------------------------------
# Tenant-isolated key builder
# ---------------------------------------------------------------------------


def build_storage_key(org_slug: str, kind: str, original_filename: str) -> str:
    """Compute the storage key for a tenant asset.

    Format: ``tenants/{org_slug}/{kind}/{uuid}{ext}`` — org_slug
    guarantees tenant isolation, UUID prevents collisions,
    original extension preserved for serving correct MIME type.
    """
    ext = os.path.splitext(original_filename or "")[1].lower() or ""
    return f"tenants/{org_slug}/{kind}/{uuid.uuid4().hex}{ext}"


# ---------------------------------------------------------------------------
# Local backend (dev/demo default)
# ---------------------------------------------------------------------------


class LocalStorageBackend:
    """File-system storage — V1 demo. Writes to settings.MEDIA_ROOT."""

    def save(self, file_obj, key: str, content_type: str) -> str:
        path = default_storage.save(key, file_obj)
        return default_storage.url(path)

    def delete(self, key: str) -> None:
        if default_storage.exists(key):
            default_storage.delete(key)

    def url_for(self, key: str) -> str:
        return default_storage.url(key)


# ---------------------------------------------------------------------------
# S3 / R2 backend (production)
# ---------------------------------------------------------------------------


class S3StorageBackend:
    """AWS S3 / Cloudflare R2 storage via django-storages[boto3].

    Activated when ``settings.MEDIA_STORAGE_BACKEND == "s3"``. Requires:

    * ``AWS_S3_BUCKET_NAME``
    * ``AWS_S3_REGION`` (or R2 endpoint URL)
    * ``AWS_ACCESS_KEY_ID``
    * ``AWS_SECRET_ACCESS_KEY``
    * ``MEDIA_PUBLIC_BASE_URL`` (CDN or S3/R2 public URL — optional,
      falls back to S3 default URL)

    R2 tip: set ``AWS_S3_ENDPOINT_URL`` to ``https://<accountid>.r2.cloudflarestorage.com``
    and ``MEDIA_PUBLIC_BASE_URL`` to your R2 public dev URL or a
    Cloudflare Worker proxy.
    """

    def __init__(self):
        try:
            from storages.backends.s3boto3 import S3Boto3Storage
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "S3StorageBackend requires django-storages[boto3]. "
                "Install via 'pip install django-storages[boto3]'."
            ) from exc

        kwargs = {
            "bucket_name": settings.AWS_S3_BUCKET_NAME,
            "region_name": settings.AWS_S3_REGION,
            "access_key": settings.AWS_ACCESS_KEY_ID,
            "secret_key": settings.AWS_SECRET_ACCESS_KEY,
        }
        endpoint = getattr(settings, "AWS_S3_ENDPOINT_URL", None)
        if endpoint:
            kwargs["endpoint_url"] = endpoint
        self._storage = S3Boto3Storage(**kwargs)
        self._public_base = getattr(settings, "MEDIA_PUBLIC_BASE_URL", None)

    def save(self, file_obj, key: str, content_type: str) -> str:
        saved = self._storage.save(key, file_obj)
        return self.url_for(saved)

    def delete(self, key: str) -> None:
        if self._storage.exists(key):
            self._storage.delete(key)

    def url_for(self, key: str) -> str:
        if self._public_base:
            return f"{self._public_base.rstrip('/')}/{key.lstrip('/')}"
        return self._storage.url(key)


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


_backend_cache: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    """Return the configured storage backend (singleton).

    Reads ``settings.MEDIA_STORAGE_BACKEND``:
    * ``"s3"`` → :class:`S3StorageBackend`
    * ``"local"`` (default) → :class:`LocalStorageBackend`
    """
    global _backend_cache
    if _backend_cache is not None:
        return _backend_cache
    backend_name = getattr(settings, "MEDIA_STORAGE_BACKEND", "local").lower()
    if backend_name == "s3":
        _backend_cache = S3StorageBackend()
    else:
        _backend_cache = LocalStorageBackend()
    return _backend_cache


def reset_storage_backend_cache() -> None:
    """Reset the singleton — used by tests that swap settings.MEDIA_STORAGE_BACKEND."""
    global _backend_cache
    _backend_cache = None
