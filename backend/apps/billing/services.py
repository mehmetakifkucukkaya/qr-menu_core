"""Billing services — Sprint B1 (D-026).

Public surface (the rest is internal — see ``_resource_count`` /
``_audit_*`` helpers):

* :func:`get_plan_settings` — lazy OneToOne row (mirrors D-025
  ``get_loyalty_settings``).
* :func:`has_feature` — tenant-scoped feature-flag check; accepts
  either an ``Organization`` or a pre-fetched ``PlanSettings``.
* :func:`enforce_limit` — hard-fail at the tier ceiling. Audit +
  raise on failure.
* :func:`record_usage` — atomic ``F(metric) + delta`` monthly
  counter increment.
* :func:`get_active_plan` — shorthand ``(plan, settings)`` tuple for
  views that want both.
* :func:`get_usage_snapshot` — current-month metric→{used, limit,
  pct} for the admin dashboard.
* :func:`get_plan_limit_matrix` — static matrix of all 4 plans'
  row-for-render (admin UI B2 reads this).
* :func:`preview_upgrade` — diff current vs target plan for the
  upgrade-preview modal (B2).

Tenant isolation is enforced at the ``organization`` arg: every
function takes an ``Organization`` (or its PK), never a raw user
input. `has_feature` accepts a pre-loaded ``PlanSettings`` so callers
that batch-read (admin list views, dashboards) don't re-query the DB.
"""

from __future__ import annotations

import logging
from typing import Optional, Union

from django.db.models import Count, F, Sum
from django.utils import timezone

from apps.audit.services import record_event
from apps.organizations.models import Organization

from .constants import (
    BASIC,
    FEATURE_FIELDS,
    OPS,
    ORDERS,
    PLAN_TIER_LIMITS,
    PLAN_TIER_ORDER,
    PRO,
    RESOURCE_FIELDS,
    USAGE_METRICS,
    default_features,
    is_valid_plan,
)
from .errors import FeatureDisabled, LimitExceeded
from .models import PlanSettings, TenantUsageCounter

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# PlanSettings lazy row
# ---------------------------------------------------------------------------


def get_plan_settings(organization: Organization) -> PlanSettings:
    """Get-or-create the :class:`PlanSettings` row for ``organization``.

    Defaults to OPS (V1 demo posture — Modern Cafe runs full feature
    set). Feature booleans are seeded from the static matrix at create
    time; subsequent operator overrides survive re-fetches.
    """
    obj, _ = PlanSettings.objects.get_or_create(
        organization=organization,
        defaults={
            "active_plan": OPS,
            **default_features(OPS),
        },
    )
    return obj


def get_active_plan(organization: Organization) -> tuple[str, PlanSettings]:
    """Shorthand ``(plan_key, plan_settings)`` for views."""
    ps = get_plan_settings(organization)
    return ps.active_plan, ps


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------


def has_feature(
    org_or_plan_settings: Union[Organization, PlanSettings],
    feature: str,
) -> bool:
    """Return True iff the tenant's PlanSettings row has ``feature = True``.

    ``feature`` MUST be a member of :data:`FEATURE_FIELDS` — passing an
    unknown name returns ``False`` (the safe default — "no, you can't
    use a thing you didn't ask for by name").
    """
    if isinstance(org_or_plan_settings, PlanSettings):
        ps = org_or_plan_settings
    else:
        ps = get_plan_settings(org_or_plan_settings)
    return bool(getattr(ps, feature, False))


def require_feature(
    organization: Organization,
    feature: str,
    *,
    actor=None,
) -> None:
    """Raise :class:`FeatureDisabled` if the feature flag is off.

    Used by view-level guards (``orders_enabled``, ``payments_enabled``
    etc.). Records an audit row on rejection with action=
    ``feature_disabled_access`` and target_type=``plan_settings``.
    """
    if has_feature(organization, feature):
        return
    _audit_feature_blocked(organization, feature, actor=actor)
    raise FeatureDisabled(
        message=f"'{feature}' özelliği planınızda kapalı.",
        feature=feature,
    )


# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------


def enforce_limit(
    organization: Organization,
    resource: str,
    *,
    actor=None,
) -> None:
    """Hard-fail if the tenant's current count for ``resource`` exceeds the tier cap.

    ``resource`` is one of :data:`RESOURCE_FIELDS`. ``None`` tier limit
    = unlimited, no audit, no raise. On rejection we audit
    ``limit_exceeded_attempt`` and raise :class:`LimitExceeded`.
    """
    if resource not in RESOURCE_FIELDS:
        raise ValueError(
            f"Unknown resource '{resource}'. Valid: {RESOURCE_FIELDS}"
        )

    ps = get_plan_settings(organization)
    tier_limit = PLAN_TIER_LIMITS[ps.active_plan][resource]
    if tier_limit is None:
        return  # unlimited

    current = _resource_count(organization, resource)
    # ``>=`` not ``>`` so the 26th item creation at the BASIC 25-cap
    # fails cleanly. ``>=`` is the boundary the test plan wants.
    if current >= tier_limit:
        _audit_limit_exceeded(organization, resource, current, tier_limit, actor=actor)
        raise LimitExceeded(
            message=(
                f"'{resource}' limiti doldu ({current}/{tier_limit}). "
                "Paket yükseltin."
            ),
            resource=resource,
            current=current,
            limit=tier_limit,
        )


def _resource_count(organization: Organization, resource: str) -> int:
    """Count current usage of ``resource`` for ``organization``.

    Live counts (DB scan, not counter):
      - items: ``MenuItem.objects.filter(menu__organization=org).count()``
      - categories: ``MenuCategory.objects.filter(menu__organization=org).count()``
      - branches: ``Branch.objects.filter(organization=org).count()``
      - locales: ``len(organization.supported_locales)`` (Python)
      - monthly_views/scans/AI ops: ``TenantUsageCounter.current_for(org).<metric>``
    """
    if resource == "items":
        from apps.menu.models import MenuItem

        return MenuItem.objects.filter(menu__organization=organization).count()
    if resource == "categories":
        from apps.menu.models import MenuCategory

        return MenuCategory.objects.filter(
            menu__organization=organization
        ).count()
    if resource == "branches":
        from apps.branches.models import Branch

        return Branch.objects.filter(organization=organization).count()
    if resource == "locales":
        return len(organization.supported_locales or [])

    # Monthly aggregates — read from the counter row (the same row that
    # ``record_usage`` increments). For the very first read before any
    # event has fired, ``current_for`` creates a zero-valued row.
    counter = TenantUsageCounter.current_for(organization)
    if resource == "monthly_views":
        return int(counter.views)
    if resource == "monthly_scans":
        return int(counter.scans)
    if resource == "ai_pdf_imports":
        return int(counter.ai_pdf_imports)
    if resource == "ai_translate_ops":
        return int(counter.ai_translate_ops)
    if resource == "ai_description_ops":
        return int(counter.ai_description_ops)
    raise ValueError(f"_resource_count: unhandled resource '{resource}'")


# ---------------------------------------------------------------------------
# Usage counter
# ---------------------------------------------------------------------------


def record_usage(
    organization: Organization,
    metric: str,
    delta: int = 1,
) -> int:
    """Atomically increment the current month's counter for ``metric``.

    Uses ``F(metric) + delta`` so concurrent calls (e.g. two analytics
    events firing in parallel) don't lose updates. Returns the new
    value after the increment. ``metric`` must be in :data:`USAGE_METRICS`.
    """
    if metric not in USAGE_METRICS:
        raise ValueError(
            f"Unknown metric '{metric}'. Valid: {USAGE_METRICS}"
        )

    counter = TenantUsageCounter.current_for(organization)
    TenantUsageCounter.objects.filter(pk=counter.pk).update(
        **{metric: F(metric) + delta}
    )
    counter.refresh_from_db(fields=[metric])
    return int(getattr(counter, metric))


def get_usage_snapshot(
    organization: Organization,
) -> dict[str, dict[str, Optional[int | float]]]:
    """Return ``{metric: {used, limit, pct}}`` for the current period.

    ``limit`` is the tier ceiling from :data:`PLAN_TIER_LIMITS`. For
    unlimited metrics (``None`` limit), ``pct`` is ``None`` and ``used``
    is the live count.
    """
    ps = get_plan_settings(organization)
    limits = PLAN_TIER_LIMITS[ps.active_plan]
    counter = TenantUsageCounter.current_for(organization)

    # Map metric → (used, limit) pairs.
    metric_limit_pairs = {
        "views": (counter.views, limits["monthly_views"]),
        "scans": (counter.scans, limits["monthly_scans"]),
        "ai_pdf_imports": (
            counter.ai_pdf_imports,
            limits["ai_pdf_imports"],
        ),
        "ai_translate_ops": (
            counter.ai_translate_ops,
            limits["ai_translate_ops"],
        ),
        "ai_description_ops": (
            counter.ai_description_ops,
            limits["ai_description_ops"],
        ),
    }

    out: dict[str, dict[str, Optional[int | float]]] = {}
    for metric, (used, limit) in metric_limit_pairs.items():
        if limit is None or limit == 0:
            pct: Optional[float] = None
        else:
            pct = round(100.0 * used / limit, 2)
        out[metric] = {
            "used": int(used),
            "limit": limit if limit is not None else None,
            "pct": pct,
        }
    return out


# ---------------------------------------------------------------------------
# Plan matrix + upgrade preview
# ---------------------------------------------------------------------------


def get_plan_limit_matrix(organization: Organization) -> dict:
    """Return the static limit matrix for all 4 plans + a ``current_plan`` key.

    The admin UI (Sprint B2) renders the comparison table from this —
    keeps the API surface stable even if we move the matrix from a
    Python constant to a DB table in V2 SaaS.
    """
    current = get_plan_settings(organization).active_plan
    tiers = []
    for plan_key in PLAN_TIER_ORDER:
        entry = PLAN_TIER_LIMITS[plan_key]
        tiers.append(
            {
                "id": plan_key,
                "label": entry["label"],
                "limits": {k: entry[k] for k in RESOURCE_FIELDS},
                "features": dict(entry["features"]),
                "is_current": plan_key == current,
            }
        )
    return {"current_plan": current, "tiers": tiers}


def preview_upgrade(
    organization: Organization, target_plan: str
) -> dict:
    """Diff the tenant's current plan against ``target_plan``.

    Returns ``current_tier`` + ``target_tier`` rows + two delta lists:

    * ``feature_deltas`` — one row per ``FEATURE_FIELDS`` flag that flips
      between current/target, with before/after booleans.
    * ``resource_deltas`` — one row per ``RESOURCE_FIELDS`` limit that
      changes (including the None → int / int → None transitions).
    """
    if not is_valid_plan(target_plan):
        raise ValueError(
            f"Unknown plan '{target_plan}'. Valid: {PLAN_TIER_ORDER}"
        )

    ps = get_plan_settings(organization)
    current = ps.active_plan
    current_entry = PLAN_TIER_LIMITS[current]
    target_entry = PLAN_TIER_LIMITS[target_plan]

    feature_deltas = []
    for feature in FEATURE_FIELDS:
        before = bool(getattr(ps, feature))
        after = bool(target_entry["features"][feature])
        if before != after:
            feature_deltas.append(
                {
                    "feature": feature,
                    "before": before,
                    "after": after,
                    "direction": "up" if after and not before else "down",
                }
            )

    resource_deltas = []
    for resource in RESOURCE_FIELDS:
        before = current_entry[resource]
        after = target_entry[resource]
        if before != after:
            resource_deltas.append(
                {
                    "resource": resource,
                    "before": before,
                    "after": after,
                }
            )

    return {
        "current_plan": current,
        "target_plan": target_plan,
        "current_tier": {
            "id": current,
            "label": current_entry["label"],
        },
        "target_tier": {
            "id": target_plan,
            "label": target_entry["label"],
        },
        "feature_deltas": feature_deltas,
        "resource_deltas": resource_deltas,
    }


def update_plan_settings(
    organization: Organization,
    *,
    active_plan: Optional[str] = None,
    feature_overrides: Optional[dict[str, bool]] = None,
    billing_notes: Optional[str] = None,
    actor=None,
) -> PlanSettings:
    """Apply a plan/feature change and audit it.

    ``active_plan`` — change the tier. When the tier changes, we also
    snap the boolean columns to the new tier's defaults UNLESS the
    caller has passed explicit overrides for those features. The
    explicit override wins.

    ``feature_overrides`` — dict of ``{feature: bool}`` to set on the
    row directly. Operators use this to flip a single flag on/off
    without changing the whole tier.

    ``billing_notes`` — operator-visible note.
    """
    ps = get_plan_settings(organization)
    before = {
        "active_plan": ps.active_plan,
        "features": ps.effective_features(),
    }

    new_active_plan = active_plan or ps.active_plan
    if active_plan and not is_valid_plan(active_plan):
        raise ValueError(
            f"Unknown plan '{active_plan}'. Valid: {PLAN_TIER_ORDER}"
        )

    if active_plan:
        ps.active_plan = new_active_plan
        # Snap the booleans to the new tier's defaults.
        for feature, value in default_features(new_active_plan).items():
            setattr(ps, feature, value)

    if feature_overrides:
        for feature, value in feature_overrides.items():
            if feature not in FEATURE_FIELDS:
                raise ValueError(f"Unknown feature '{feature}'.")
            setattr(ps, feature, bool(value))

    if billing_notes is not None:
        ps.billing_notes = billing_notes

    ps.save()

    record_event(
        organization=organization,
        actor=actor,
        action="plan_changed",
        target_type="plan_settings",
        target_id=ps.id,
        target_repr=str(ps),
        payload={
            "before": before,
            "after": {
                "active_plan": ps.active_plan,
                "features": ps.effective_features(),
            },
        },
    )
    return ps


def reset_usage_for_org(organization: Organization) -> int:
    """Reset (delete) all monthly counter rows for ``organization``.

    V1 superuser-only "demo helper" — replaces what V2 SaaS does with a
    monthly cron + Celery beat (D-026 risk register). Returns the
    number of rows deleted.
    """
    deleted, _ = TenantUsageCounter.objects.filter(
        organization=organization
    ).delete()
    return deleted


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _audit_feature_blocked(
    organization: Organization,
    feature: str,
    *,
    actor=None,
) -> None:
    """Record a ``feature_disabled_access`` audit row."""
    record_event(
        organization=organization,
        actor=actor,
        action="feature_disabled_access",
        target_type="plan_settings",
        target_id=get_plan_settings(organization).id,
        target_repr=f"PlanSettings<{organization.id}>",
        payload={"feature": feature, "plan": get_plan_settings(organization).active_plan},
    )


def _audit_limit_exceeded(
    organization: Organization,
    resource: str,
    current: int,
    limit: int,
    *,
    actor=None,
) -> None:
    """Record a ``limit_exceeded_attempt`` audit row."""
    record_event(
        organization=organization,
        actor=actor,
        action="limit_exceeded_attempt",
        target_type="plan_settings",
        target_id=get_plan_settings(organization).id,
        target_repr=f"PlanSettings<{organization.id}>",
        payload={
            "resource": resource,
            "current": current,
            "limit": limit,
            "plan": get_plan_settings(organization).active_plan,
        },
    )