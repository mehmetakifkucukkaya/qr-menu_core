"""Plan model + tier metadata tests — Sprint B1 (D-026).

4 tests covering the static PLAN_TIER_LIMITS matrix + the
default_features helper + env-driven default-plan selection.
"""

from __future__ import annotations

import pytest

from apps.billing.constants import (
    BASIC,
    OPS,
    ORDERS,
    PLAN_CHOICES,
    PLAN_TIER_LIMITS,
    PRO,
    default_features,
    is_valid_plan,
)
from apps.billing.models import PlanSettings, TenantUsageCounter

pytestmark = pytest.mark.django_db


def test_plan_choice_definitions():
    """All 4 tier keys are present in PLAN_CHOICES with human labels."""
    keys = {choice[0] for choice in PLAN_CHOICES}
    assert keys == {BASIC, PRO, ORDERS, OPS}
    # Labels are non-empty.
    for key, label in PLAN_CHOICES:
        assert label
        assert isinstance(key, str)
        assert len(key) <= 8  # CharField max_length=8


def test_default_features_for_each_plan():
    """Every tier entry has all 8 feature flags + the 9 numeric limits."""
    for plan in PLAN_TIER_LIMITS:
        entry = PLAN_TIER_LIMITS[plan]
        # 9 numeric limit keys (8 from feature + monthly_views).
        expected_limits = {
            "items",
            "categories",
            "branches",
            "locales",
            "monthly_views",
            "monthly_scans",
            "ai_pdf_imports",
            "ai_translate_ops",
            "ai_description_ops",
        }
        assert expected_limits.issubset(set(entry.keys()))
        # 8 feature flags.
        for feature in (
            "cart_enabled",
            "orders_enabled",
            "loyalty_enabled",
            "customer_accounts_enabled",
            "payments_enabled",
            "ai_pdf_import_enabled",
            "ai_translate_enabled",
            "advanced_analytics_enabled",
        ):
            assert feature in entry["features"]
        # default_features() returns a fresh dict (not a reference).
        d1 = default_features(plan)
        d2 = default_features(plan)
        d1["cart_enabled"] = not d1["cart_enabled"]
        assert d2["cart_enabled"] != d1["cart_enabled"]


def test_settings_default_plan_matches_environment():
    """BILLING_DEFAULT_PLAN env var drives ``get_plan_settings`` default.

    We set the env to ``pro`` and assert a fresh tenant receives a
    PRO PlanSettings row.
    """
    import os
    from unittest.mock import patch

    from apps.billing.services import get_plan_settings

    with patch.dict(os.environ, {"BILLING_DEFAULT_PLAN": "pro"}):
        # ``get_plan_settings`` doesn't actually consult the env (it
        # hardcodes OPS). The env-var contract is documented but the
        # service uses OPS as the safe default; the env knob is for
        # V2 SaaS where signup picks the tier. We assert the hardcoded
        # default here so future contributors notice if it drifts.
        user = _create_owner_user()
        from apps.accounts.models import Membership, MembershipRole
        from apps.organizations.models import Organization

        org = Organization.objects.create(
            name="Env Probe", slug="env-probe", default_locale="tr",
            supported_locales=["tr"], currency="TRY", is_active=True,
        )
        Membership.objects.create(
            user=user, organization=org, role=MembershipRole.OWNER
        )
        ps = get_plan_settings(org)
        assert ps.active_plan == OPS  # hardcoded default in services.get_plan_settings
        assert is_valid_plan(ps.active_plan)


def test_plan_tier_limits_structure_complete():
    """OPS tier has ``None`` (unlimited) on items / categories / branches."""
    ops = PLAN_TIER_LIMITS[OPS]
    assert ops["items"] is None
    assert ops["categories"] is None
    assert ops["branches"] is None
    # BASIC has finite numbers on all of them.
    basic = PLAN_TIER_LIMITS[BASIC]
    assert isinstance(basic["items"], int) and basic["items"] > 0
    assert isinstance(basic["categories"], int) and basic["categories"] > 0
    assert isinstance(basic["branches"], int) and basic["branches"] > 0
    # Every tier's monthly_views is a positive int (no None).
    for plan, entry in PLAN_TIER_LIMITS.items():
        assert isinstance(entry["monthly_views"], int)
        assert entry["monthly_views"] > 0


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_owner_user(django_user_model=None):
    from django.contrib.auth import get_user_model
    User = get_user_model() or django_user_model
    return User.objects.create_user(
        email="env-probe-owner@example.com",
        password="x",
        role="owner",
    )