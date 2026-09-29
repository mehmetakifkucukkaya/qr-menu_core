"""Media models — Sprint E1 (D-033).

The ``MediaAsset`` model is the new tenant-scoped media registry. It
decouples uploads from the legacy ``ImageField`` columns
(``Organization.logo``, ``Organization.cover_image``,
``MenuCategory.image``, ``MenuItem.image``) which stay in place for
backward-compatibility — V1 demo runs on the old fields, new uploads
go through MediaAsset.

Tenant isolation: every row is FK-scoped to ``Organization``. Storage
key prefix ``tenants/{org_slug}/`` is computed server-side
(``apps.media.storage.build_storage_key``); clients never control it.

Sprint E1 ships the schema + storage abstraction. UI integration
(Sprint E2) replaces ImageField pickers with a MediaGallery modal.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class MediaKind(models.TextChoices):
    IMAGE = "image", "Image"
    VIDEO = "video", "Video"
    AUDIO = "audio", "Audio"
    FILE = "file", "File"


class MediaAsset(TimeStampedModel):
    """A tenant-scoped media asset (image, video, audio, file)."""

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="media_assets",
    )
    kind = models.CharField(max_length=10, choices=MediaKind.choices, default=MediaKind.IMAGE)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size_bytes = models.PositiveBigIntegerField(default=0)
    storage_key = models.CharField(max_length=500, db_index=True)
    public_url = models.URLField(max_length=1000)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    alt_text = models.CharField(max_length=300, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="uploaded_media",
    )
    is_active = models.BooleanField(default=True, db_index=True)

    # Optional thumbnail (for image kind) — same S3/local path but different size.
    thumbnail_key = models.CharField(max_length=500, blank=True, default="")
    thumbnail_url = models.URLField(max_length=1000, blank=True, default="")

    class Meta:
        verbose_name = "Medya Varlığı"
        verbose_name_plural = "Medya Varlıkları"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["organization", "kind", "is_active"]),
            models.Index(fields=["organization", "-created_at"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.kind}:{self.original_filename} ({self.organization_id})"
