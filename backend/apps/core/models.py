"""Base models for the qr_menu_core backend.

A small set of reusable abstract models:
- TimeStampedModel: created_at + updated_at
- SluggedModel: base for slug-unique models (Organization, Branch)

Domain-specific mixins live alongside their apps.
"""

from __future__ import annotations

from django.db import models


class TimeStampedModel(models.Model):
    """Adds created_at / updated_at to concrete subclasses."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SluggedModel(models.Model):
    """Adds a slug field with sensible defaults.

    Concrete subclasses are expected to set ``slug`` unique + db_index,
    and to provide their own ``Meta`` for ``unique_together`` if needed.
    """

    slug = models.SlugField(max_length=120, unique=True, db_index=True)

    class Meta:
        abstract = True
