"""Branch model — a physical location under an Organization."""

from __future__ import annotations

from django.db import models

from apps.core.models import SluggedModel, TimeStampedModel
from apps.organizations.models import Organization


class BranchQuerySet(models.QuerySet):
    """Tenant-scoped branch queries."""

    def active(self):
        return self.filter(is_active=True)

    def for_user(self, user):
        """Branches the user can access via their org memberships."""
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(organization__memberships__user=user).distinct()


class Branch(SluggedModel, TimeStampedModel):
    """A single physical location of an Organization."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="branches",
    )
    # SluggedModel declares ``slug`` globally unique; we override to
    # allow duplicate slugs across different organizations. The
    # (organization, slug) pair is enforced via unique_together below.
    slug = models.SlugField(max_length=120, unique=False, db_index=True)
    name = models.CharField(max_length=160)
    phone = models.CharField(max_length=32, blank=True, default="")
    whatsapp_phone = models.CharField(max_length=32, blank=True, default="")
    address = models.TextField(blank=True, default="")
    google_maps_url = models.URLField(blank=True, default="")
    # Working hours schema is finalized in Sprint 2 (see DECISIONS.md OP-8).
    # Sprint 1 ships with an empty JSON dict so the field exists and is queryable.
    working_hours_json = models.JSONField(default=dict, blank=True)

    is_active = models.BooleanField(default=True)

    objects = BranchQuerySet.as_manager()

    class Meta:
        verbose_name = "Şube"
        verbose_name_plural = "Şubeler"
        ordering = ("organization", "name")
        unique_together = (("organization", "slug"),)
        indexes = [
            models.Index(fields=["organization", "is_active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.organization.name} / {self.name}"
