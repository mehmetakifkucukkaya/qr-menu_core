"""QR code model — Sprint 5A.

Each QRCode represents a printed / downloadable QR code that points at the
public menu page for one Organization + (optionally) one Branch + one Menu.
The ``target_url`` field is computed at save-time from those relations so
the model stays portable — the frontend reads it back and the download
endpoint encodes it directly into the PNG (no recomputation needed).

Decisions encoded here:

- **Tenant root is ``organization``** — even when a branch is attached, the
  org is the tenant boundary used by ``IsOrganizationMember``. Branch is
  nullable so a single QR can target an org-wide menu.
- **``target_url`` computed on save** — keeps the public URL pattern in
  one place (``apps.qr.utils.build_target_url``). The Sprint 5 plan's
  ``/{PUBLIC_BASE_URL}/m/{business_slug}?branch={branch_slug}&qr={qr_id}``
  format is stable.
- **``scan_count`` lives here, not on ``MenuViewEvent``** — it's an
  analytical counter we expose on the QR list/detail endpoints. The actual
  "scan" events are recorded in ``analytics.MenuViewEvent`` (D-017) and
  surface as an aggregated ``top_qr_codes`` list on the analytics overview.
- **Soft delete via ``is_active``** — matches the rest of the codebase
  (Menu, Branch, ThemeConfig). DELETE flips the flag; admin list filters
  it out by default.
"""

from __future__ import annotations

from django.db import models

from apps.branches.models import Branch
from apps.core.models import TimeStampedModel
from apps.menu.models import Menu
from apps.organizations.models import Organization

from .utils import build_target_url


class QRCodeQuerySet(models.QuerySet):
    """Tenant-scoped QR code queries."""

    def active(self):
        return self.filter(is_active=True)

    def for_user(self, user):
        if getattr(user, "is_platform_admin", False):
            return self.all()
        return self.filter(organization__memberships__user=user).distinct()


class QRCode(TimeStampedModel):
    """A QR code pointing at the public menu page."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="qr_codes",
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.SET_NULL,
        related_name="qr_codes",
        null=True,
        blank=True,
    )
    menu = models.ForeignKey(
        Menu,
        on_delete=models.CASCADE,
        related_name="qr_codes",
    )

    label = models.CharField(
        max_length=80,
        help_text="Kısa açıklama — örn. 'Kasa Önü', 'Bahçe Masa 4'.",
    )
    target_url = models.URLField(
        max_length=500,
        help_text="Public menü URL'si; save() tarafından otomatik hesaplanır.",
    )
    table_number = models.CharField(
        max_length=20,
        blank=True,
        default="",
        help_text="Opsiyonel masa numarası (operasyonel takip için).",
    )

    scan_count = models.PositiveIntegerField(
        default=0,
        help_text="Bu QR kod için kaydedilen toplam tarama sayısı.",
    )
    is_active = models.BooleanField(default=True)

    objects = QRCodeQuerySet.as_manager()

    class Meta:
        verbose_name = "QR Kod"
        verbose_name_plural = "QR Kodlar"
        ordering = ("organization", "-created_at")
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["menu", "is_active"]),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"QR#{self.id} {self.label} ({self.organization.slug})"

    # ----- Computed fields -------------------------------------------------

    def save(self, *args, **kwargs):
        """Compute target_url on every save so it stays in sync with FKs.

        We rebuild the URL even when ``target_url`` was set externally —
        the FK chain is authoritative. The pk is unavailable pre-insert,
        so on first save we omit the ``qr=`` query param; the QR PNG
        generated right after creation re-fetches the row with its pk and
        re-renders.
        """
        org = self.organization
        menu = self.menu
        branch = self.branch
        business_slug = getattr(org, "slug", "") or ""
        branch_slug = getattr(branch, "slug", None) if branch else None
        qr_id = self.pk if self.pk else None
        computed = build_target_url(
            business_slug=business_slug,
            branch_slug=branch_slug,
            qr_id=qr_id,
        )
        # Only overwrite when the current value is empty or matches the
        # previously-computed shape — leaves room for tests that want to
        # inspect a manual override (none in V1, but cheap to allow).
        if not self.target_url or self.target_url != computed:
            self.target_url = computed
        super().save(*args, **kwargs)
        # First save: pk was None above. Refresh target_url with the pk
        # so subsequent downloads include ?qr=<id> (analytics filter).
        if qr_id is None and self.pk:
            self.target_url = build_target_url(
                business_slug=business_slug,
                branch_slug=branch_slug,
                qr_id=self.pk,
            )
            super().save(update_fields=["target_url", "updated_at"])
