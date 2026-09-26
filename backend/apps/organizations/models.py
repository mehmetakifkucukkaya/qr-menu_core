"""Organization model — the tenant root for branches, menus, themes."""

from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.core.models import SluggedModel, TimeStampedModel


class OrganizationQuerySet(models.QuerySet):
    """Tenant-scoped queryset helpers."""

    def active(self):
        return self.filter(is_active=True)

    def for_user(self, user):
        """Organizations the given user has an active Membership in.

        Platform admins (User.is_platform_admin) get the full queryset.
        """
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(memberships__user=user).distinct()


class Organization(SluggedModel, TimeStampedModel):
    """Restaurant / cafe / business tenant."""

    name = models.CharField(max_length=160)
    legal_name = models.CharField(max_length=200, blank=True, default="")
    description = models.TextField(blank=True, default="")

    logo = models.ImageField(upload_to="organizations/logos/", blank=True, null=True)
    cover_image = models.ImageField(upload_to="organizations/covers/", blank=True, null=True)

    phone = models.CharField(max_length=32, blank=True, default="")
    whatsapp_phone = models.CharField(max_length=32, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(blank=True, default="")
    instagram_url = models.URLField(blank=True, default="")

    address = models.TextField(blank=True, default="")
    google_maps_url = models.URLField(blank=True, default="")

    # Locale / currency — defaults per PRD/TR locale.
    default_locale = models.CharField(max_length=8, default="tr")
    supported_locales = models.JSONField(default=list)  # type: ignore[var-annotated]
    currency = models.CharField(max_length=8, default="TRY")

    is_active = models.BooleanField(default=True)

    objects = OrganizationQuerySet.as_manager()

    class Meta:
        verbose_name = "İşletme"
        verbose_name_plural = "İşletmeler"
        ordering = ("name",)
        indexes = [
            models.Index(fields=["is_active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.name} ({self.slug})"

    # --- Tenant helpers ---
    def is_member(self, user) -> bool:
        if not getattr(user, "is_authenticated", False):
            return False
        if getattr(user, "is_platform_admin", False):
            return True
        return self.memberships.filter(user=user).exists()

    def membership_for(self, user):
        return self.memberships.filter(user=user).first()


# Late import to avoid circular dependency between accounts and organizations.
# (accounts.models.User references "organizations.Organization" via string.)
def _resolve_user_label():  # pragma: no cover - only used for admin display
    return settings.AUTH_USER_MODEL
