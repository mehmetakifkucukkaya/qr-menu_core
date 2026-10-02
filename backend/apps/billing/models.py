"""Billing models — Sprint B1 (D-026).

Two tenant-scoped models following the D-025 OneToOne pattern:

* :class:`PlanSettings` — OneToOne on ``Organization``. Stores the
  tenant's active plan tier + 8 boolean feature flags + an
  operator-visible note. The flags are operator-overridable so the
  V1 admin can flip a single feature on/off without changing the
  whole tier (V2 SaaS keeps override = False by default and
  surfaces "override" badges in the UI).

* :class:`TenantUsageCounter` — ForeignKey on ``Organization``. Monthly
  aggregate (period_year, period_month, views, scans, ai ops). The
  unique constraint on (org, year, month) gives us idempotent
  ``current_for()`` and prevents accidental double-increment races
  (the actual increment is still done via F() expression to avoid
  load-read-ask — see ``services.record_usage``).
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel

from .constants import FEATURE_FIELDS, PLAN_CHOICES, default_features, platform_forced_off


class PlanSettings(TimeStampedModel):
    """Per-tenant plan tier + feature flag overrides.

    Mirrors :class:`apps.account.models.LoyaltySettings` exactly
    (D-025 OneToOne pattern): one row per ``Organization``, lazily
    created on first read via :func:`apps.billing.services.get_plan_settings`.

    The 8 boolean columns are operator overrides — they default to the
    feature matrix of ``active_plan`` at creation time, but the admin
    can flip them individually. ``has_feature()`` reads from these
    fields directly, NOT from the static matrix, so an override takes
    effect immediately on the next request.
    """

    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="plan_settings",
    )

    # Plan tier — string key, CharField (not DB enum) so V2 SaaS can
    # introduce new tiers without a schema migration.
    active_plan = models.CharField(
        max_length=8,
        choices=PLAN_CHOICES,
        default="ops",
        help_text="Aktif paket — Basic/Pro/Orders/Ops.",
    )

    # 8 feature flags (see ``FEATURE_FIELDS``). Boolean defaults are
    # applied at create-time from ``default_features(active_plan)``.
    cart_enabled = models.BooleanField(default=False)
    orders_enabled = models.BooleanField(default=False)
    loyalty_enabled = models.BooleanField(default=False)
    customer_accounts_enabled = models.BooleanField(default=False)
    payments_enabled = models.BooleanField(default=False)
    ai_pdf_import_enabled = models.BooleanField(default=False)
    ai_translate_enabled = models.BooleanField(default=False)
    advanced_analytics_enabled = models.BooleanField(default=False)

    billing_notes = models.TextField(
        blank=True,
        default="",
        help_text="Operator-visible note (coupon applied, manual override, …).",
    )

    # Sprint C3 — Trial window (D-030 follow-up). When ``trial_ends_at``
    # is in the future the tenant has OPS-full features regardless of
    # ``active_plan`` (the gating logic lives in ``services.has_feature``
    # which checks ``is_in_trial`` first). V2 SaaS feature: webhook-driven
    # downgrade; V1 demo: TrialBanner-driven first-page check.
    trial_started_at = models.DateTimeField(null=True, blank=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Plan Ayarları"
        verbose_name_plural = "Plan Ayarları"
        indexes = [models.Index(fields=["organization"])]

    def __str__(self) -> str:  # pragma: no cover
        return f"PlanSettings<{self.organization_id}/{self.active_plan}>"

    def effective_features(self) -> dict[str, bool]:
        """Return the current effective feature flags as a dict.

        Used by :func:`apps.billing.services.has_feature` — the
        operator override on this row wins over the static tier
        defaults in :data:`PLAN_TIER_LIMITS`. The keys returned are
        exactly :data:`FEATURE_FIELDS`. Flags the platform has switched off
        globally (:func:`platform_forced_off`) are reported False.
        """
        forced_off = platform_forced_off()
        return {
            field: bool(getattr(self, field)) and field not in forced_off
            for field in FEATURE_FIELDS
        }

    def reset_features_to_plan(self) -> None:
        """Snap the boolean columns back to the static matrix default
        for ``self.active_plan``. Useful when an override goes wrong and
        the operator wants to revert. Called by ``admin.py`` action.
        """
        defaults = default_features(self.active_plan)
        for field, value in defaults.items():
            setattr(self, field, value)


class TenantUsageCounter(TimeStampedModel):
    """Monthly aggregate of usage metrics for one tenant.

    One row per (organization, year, month) — the
    ``unique_together`` constraint catches the race where two requests
    land in different processes within the same second and both call
    :func:`apps.billing.services.get_or_create_current_month` (we use
    ``get_or_create`` inside ``current_for()`` and let the constraint
    raise if the second writer lost the race; the service catches it
    and re-fetches).

    The increment itself is done via ``F(metric) + delta`` (see
    :func:`apps.billing.services.record_usage`) so concurrent
    increments don't lose updates under SQLite + Postgres alike.
    """

    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="usage_counters",
    )

    period_year = models.PositiveSmallIntegerField(
        help_text="UTC year — e.g. 2026.",
    )
    period_month = models.PositiveSmallIntegerField(
        help_text="UTC month — 1..12.",
    )

    views = models.PositiveIntegerField(default=0)
    scans = models.PositiveIntegerField(default=0)
    ai_pdf_imports = models.PositiveIntegerField(default=0)
    ai_translate_ops = models.PositiveIntegerField(default=0)
    ai_description_ops = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Aylık Kullanım Sayacı"
        verbose_name_plural = "Aylık Kullanım Sayaçları"
        indexes = [
            models.Index(
                fields=["organization", "period_year", "period_month"],
                name="billing_usage_period_idx",
            ),
        ]
        unique_together = (
            ("organization", "period_year", "period_month"),
        )

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"TenantUsageCounter<{self.organization_id}/"
            f"{self.period_year}-{self.period_month:02d}>"
        )

    @classmethod
    def current_for(cls, organization) -> "TenantUsageCounter":
        """Get-or-create the current month's counter row for ``organization``.

        Uses :func:`django.utils.timezone.now` for the Y/M — so the
        counter respects the Django ``TIME_ZONE`` setting (V1 default
        ``Europe/Istanbul``). Returns a freshly-saved row if none
        exists for (Y, M) yet.
        """
        now = timezone.now()
        return cls.objects.get_or_create(
            organization=organization,
            period_year=now.year,
            period_month=now.month,
        )[0]