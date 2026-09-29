"""Billing test factories — Sprint B1 (D-026).

Two factory functions (mirrors the lightweight pattern used in
``apps/account/tests/factories.py``):

* :func:`make_plan_settings` — create-or-update the PlanSettings row
  for an organization with a chosen tier + feature override dict.
* :func:`make_usage_counter` — create a single TenantUsageCounter row
  for a (org, year, month) tuple with chosen metric values.

The factories use ``update_or_create`` for ``make_plan_settings`` so
admin-style overrides (e.g. flipping a single feature off on the OPS
tier) survive re-runs.
"""

from __future__ import annotations

from typing import Optional

from apps.billing.constants import OPS, default_features, is_valid_plan
from apps.billing.models import PlanSettings, TenantUsageCounter
from apps.organizations.models import Organization


def make_plan_settings(
    organization: Organization,
    *,
    plan: str = OPS,
    features: Optional[dict] = None,
    billing_notes: str = "",
) -> PlanSettings:
    """Create-or-update the PlanSettings row for ``organization``.

    Defaults to OPS + all-features-on (the V1 demo posture).
    ``features`` lets a test opt out of a specific flag without
    flipping the whole tier — e.g. ``make_plan_settings(org,
    features={'orders_enabled': False})`` keeps the OPS tier but
    disables the cart/orders path.
    """
    if not is_valid_plan(plan):
        raise ValueError(f"Unknown plan '{plan}'.")

    defaults = {
        "active_plan": plan,
        "billing_notes": billing_notes,
        **default_features(plan),
    }
    if features:
        defaults.update(features)

    obj, _ = PlanSettings.objects.update_or_create(
        organization=organization,
        defaults=defaults,
    )
    return obj


def make_usage_counter(
    organization: Organization,
    *,
    period_year: int,
    period_month: int,
    views: int = 0,
    scans: int = 0,
    ai_pdf_imports: int = 0,
    ai_translate_ops: int = 0,
    ai_description_ops: int = 0,
) -> TenantUsageCounter:
    """Create-or-update a single TenantUsageCounter row.

    Used to seed the counter above its tier cap (for limit-exceeded
    tests) or below (for snapshot-pct calculations).
    """
    obj, _ = TenantUsageCounter.objects.update_or_create(
        organization=organization,
        period_year=period_year,
        period_month=period_month,
        defaults={
            "views": views,
            "scans": scans,
            "ai_pdf_imports": ai_pdf_imports,
            "ai_translate_ops": ai_translate_ops,
            "ai_description_ops": ai_description_ops,
        },
    )
    return obj