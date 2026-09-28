"""Models for AI translation + product description — Sprint 9A.

Two models back the flow:

* ``TranslationMemory`` — append-only cache of (org, source_text_hash,
  source_locale) → translated_text. ``source_text_hash`` is SHA-256 of
  the *normalized* (stripped) source so the same menu string doesn't
  hit the API twice for the same tenant. ``unique_together`` on
  ``(organization, source_text_hash, target_locale)`` keeps the cache
  tenant-isolated — org A's "Türk Kahvesi → Coffee" cannot satisfy
  org B's request.
* ``AIProductDescription`` — latest generated description per
  ``(menu_item, locale)``. ``is_edited`` flips to ``True`` whenever an
  admin hand-edits the text via the inline editor (Sprint 9B); the
  service layer treats ``is_edited=True`` as a regen guard so a
  manual edit isn't clobbered by a stray background regen.

The schema is intentionally narrow: V2 will likely add per-provider
prompt versioning + audit-of-edits, but for the V1 deliverable we
keep the cache lookup = O(1) on (org, src_hash, tgt_locale).
"""

from __future__ import annotations

from django.db import models

from apps.menu.models import LOCALE_CHOICES, MenuItem
from apps.organizations.models import Organization


class TranslationMemory(models.Model):
    """Cached AI translation for a single (org, source-text, target-locale).

    The cache key is the SHA-256 of the *normalized* source text
    (``text.strip()`` — Sprint 9A keeps it simple; Sprint 9B may add
    lower-casing for case-insensitive hits). Lookup is therefore
    collision-free across tenants and across distinct source strings.

    ``source_text`` carries a snapshot of the original (up to 500
    chars) for debug/replay — the cache lookup itself only uses the
    hash.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="translation_memory",
    )

    # Source-side bookkeeping
    source_text_hash = models.CharField(
        max_length=64,
        help_text="SHA-256 hex of the normalized source text.",
    )
    source_locale = models.CharField(
        max_length=5,
        choices=LOCALE_CHOICES,
    )
    source_text = models.TextField(
        blank=True,
        default="",
        help_text="Snapshot of the original source (truncated to 500 chars).",
    )

    # Target-side result
    target_locale = models.CharField(
        max_length=5,
        choices=LOCALE_CHOICES,
    )
    translated_text = models.TextField()

    # Provider metadata — mirrors D-021 / ``MenuImportDraft.ai_*``.
    ai_provider = models.CharField(max_length=16)  # 'openai' | 'anthropic'
    ai_model = models.CharField(max_length=64)
    confidence = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Provider-reported confidence in [0.00, 1.00].",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Translation Memory"
        verbose_name_plural = "Translation Memories"
        ordering = ("-created_at",)
        unique_together = (
            ("organization", "source_text_hash", "target_locale"),
        )
        indexes = [
            models.Index(fields=["organization", "target_locale"]),
            models.Index(fields=["source_text_hash"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"TranslationMemory<org={self.organization_id} "
            f"{self.source_locale}->{self.target_locale} "
            f"hash={self.source_text_hash[:8]}>"
        )


class AIProductDescription(models.Model):
    """Latest AI-generated description for a menu item in a given locale.

    Unique on ``(menu_item, locale)`` so re-generation is an upsert
    rather than a fresh row. ``is_edited`` is the regen guard: once
    the admin hand-edits the generated text, the service stops
    overwriting it unless the caller passes ``force=True``.

    The tenant boundary is enforced via ``MenuItem.menu.organization``
    (the FK path), but we also store ``organization`` as a denormalised
    FK to keep tenant-scoped admin queries simple (e.g. "show me all
    auto-generated descriptions for org X this month").
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="ai_descriptions",
    )
    menu_item = models.ForeignKey(
        MenuItem,
        on_delete=models.CASCADE,
        related_name="ai_descriptions",
    )

    locale = models.CharField(max_length=5, choices=LOCALE_CHOICES)
    generated_text = models.TextField()

    ai_provider = models.CharField(max_length=16)
    ai_model = models.CharField(max_length=64)
    confidence = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
    )

    # Regen guard — flips to True when the admin inline-edits the text.
    is_edited = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "AI Product Description"
        verbose_name_plural = "AI Product Descriptions"
        ordering = ("-updated_at",)
        unique_together = (("menu_item", "locale"),)
        indexes = [
            models.Index(fields=["organization", "locale"]),
            models.Index(fields=["menu_item", "locale"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"AIProductDescription<item={self.menu_item_id} "
            f"{self.locale} edited={self.is_edited}>"
        )
