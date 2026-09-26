"""Models for the AI PDF menu import flow — Sprint 7A (D-021).

Two models back the workflow:

* ``MenuImportDraft`` — one per PDF upload. Holds the raw filename / size /
  parsed JSON, the AI provider used, the average confidence score, and the
  status (``pending`` → ``parsing`` → ``parsed`` → ``confirmed``/``discarded``/``failed``).
  After confirmation we point the draft at the resulting ``Menu`` so the
  admin UI can deep-link "import history → menu".
* ``MenuImportItem`` — one per detected menu entry. Categories are stored
  as raw strings (``category_name``) because the AI groups by header text
  and we don't want to create ``MenuCategory`` rows until the operator
  confirms. ``confidence`` and ``is_edited`` drive the admin review UX.

Design notes:

* Drafts are tenant-scoped via ``organization`` — same IsOrganizationMember
  pattern as ``Menu`` / ``QRCode``.
* Parsed data lives in a JSONField rather than a normalised table so the AI
  schema can evolve without migrations (V2 ileri: pricing tiers, photo URLs).
* ``raw_pdf_path`` points at a file on ``MEDIA_ROOT`` (not a Django
  ``FileField``) so we control the directory layout and so cleanup is
  straightforward: ``MEDIA_ROOT/pdf_imports/{org_id}/{uuid}.pdf``.
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel
from apps.menu.models import Menu
from apps.organizations.models import Organization


class MenuImportDraftQuerySet(models.QuerySet):
    """Tenant-scoped draft queries."""

    def for_user(self, user):
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(organization__memberships__user=user).distinct()


class MenuImportDraft(TimeStampedModel):
    """A single PDF upload + its AI parse outcome.

    Lifecycle::

        pending → parsing → parsed → confirmed
                                ↘ discarded
                                ↘ failed (terminal — never re-parses)

    Terminal states (``confirmed``, ``discarded``, ``failed``) are
    final — re-running an upload creates a fresh row.
    """

    STATUS_CHOICES = [
        ("pending", "Pending upload"),
        ("parsing", "AI parsing in progress"),
        ("parsed", "Parsed, awaiting review"),
        ("confirmed", "Confirmed, items saved"),
        ("discarded", "Discarded"),
        ("failed", "Parse failed"),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="import_drafts",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="import_drafts",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
        db_index=True,
    )

    # AI provider that produced the parse (only set after parsing succeeds).
    ai_provider = models.CharField(max_length=30, blank=True, default="")
    ai_model = models.CharField(max_length=80, blank=True, default="")

    # Source PDF bookkeeping.
    raw_pdf_filename = models.CharField(max_length=200)
    raw_pdf_size_bytes = models.PositiveIntegerField()
    # Absolute filesystem path under MEDIA_ROOT — see views.py for the
    # ``pdf_imports/{org_id}/{uuid}.pdf`` layout.
    raw_pdf_path = models.CharField(max_length=500, blank=True, default="")

    parsed_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="AI output normalised to {categories: [...]}.",
    )
    error = models.JSONField(
        default=dict,
        blank=True,
        help_text="Populated when status=failed; ``{code, message}``.",
    )

    # Average of all item confidences — drives the admin UX banner.
    confidence_avg = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        null=True,
        blank=True,
    )

    # Set after the draft is confirmed and the bulk save has run.
    menu = models.ForeignKey(
        Menu,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_import_draft",
    )

    objects = MenuImportDraftQuerySet.as_manager()

    class Meta:
        verbose_name = "PDF Import Draft"
        verbose_name_plural = "PDF Import Drafts"
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["organization", "status"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"Draft<{self.id} {self.raw_pdf_filename} "
            f"status={self.status} org={self.organization_id}>"
        )

    @property
    def is_terminal(self) -> bool:
        """Whether the draft is in a final state and can't be re-parsed."""
        return self.status in {"confirmed", "discarded", "failed"}

    @property
    def is_editable(self) -> bool:
        """Whether items under this draft can still be edited inline."""
        return self.status == "parsed"


class MenuImportItemQuerySet(models.QuerySet):
    """Tenant-scoped item queries (joins through draft → organization)."""

    def for_user(self, user):
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(draft__organization__memberships__user=user).distinct()


class MenuImportItem(models.Model):
    """A single parsed item belonging to a ``MenuImportDraft``.

    ``category_name`` is a free-form string (the AI's best guess from the
    section heading). On confirm we group items by this string and create
    one ``MenuCategory`` per unique name.

    ``confidence`` is a Decimal in [0.00, 1.00]. The admin UI uses a
    0.50 threshold to highlight low-confidence rows (Sprint 7B).
    ``is_edited`` flips to ``True`` after any PATCH from the admin.
    """

    draft = models.ForeignKey(
        MenuImportDraft,
        on_delete=models.CASCADE,
        related_name="items",
    )

    sort_order = models.PositiveIntegerField(default=0)
    category_name = models.CharField(max_length=80)

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default="")
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Parsed unit price. Null when the AI couldn't find a price.",
    )
    currency = models.CharField(max_length=3, default="TRY")

    allergens = models.JSONField(
        default=list,
        blank=True,
        help_text='List of allergen codes detected by the AI (e.g. ["gluten"]).',
    )
    dietary_tags = models.JSONField(
        default=list,
        blank=True,
        help_text='List of dietary tag codes (e.g. ["vegan", "popular"]).',
    )

    raw_text = models.TextField(
        blank=True,
        default="",
        help_text="Verbatim line/section from the PDF, kept for traceability.",
    )
    confidence = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal("1.00"),
    )
    is_edited = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = MenuImportItemQuerySet.as_manager()

    class Meta:
        verbose_name = "PDF Import Item"
        verbose_name_plural = "PDF Import Items"
        ordering = ("sort_order", "id")
        indexes = [
            models.Index(fields=["draft", "category_name", "sort_order"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"ImportItem<{self.id} {self.name!r} cat={self.category_name!r}>"