"""Feature flag matrix tests — Sprint B1 (D-026).

8 tests covering the has_feature() matrix:

* Per-tier default flag sets (BASIC all-off, OPS all-on, PRO AI-only,
  ORDERS cart+orders).
* Manual override precedence — operator can flip a single flag on/off
  even when the tier default is the opposite.
* Both input shapes — Organization instance + PlanSettings instance.
"""

from __future__ import annotations

import pytest

from apps.billing.constants import BASIC, OPS, ORDERS, PRO
from apps.billing.services import (
    FEATURE_FIELDS,
    get_plan_settings,
    has_feature,
    require_feature,
)
from apps.billing.errors import FeatureDisabled

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Per-tier matrix
# ---------------------------------------------------------------------------


def test_has_feature_basic_returns_all_false(make_plan_settings, organization_a):
    make_plan_settings(organization_a, plan=BASIC)
    for feature in FEATURE_FIELDS:
        assert has_feature(organization_a, feature) is False, feature


def test_has_feature_ops_returns_all_true(make_plan_settings, organization_a):
    make_plan_settings(organization_a, plan=OPS)
    for feature in FEATURE_FIELDS:
        assert has_feature(organization_a, feature) is True, feature


def test_has_feature_pro_ai_only(make_plan_settings, organization_a):
    """PRO: AI flags + advanced analytics on, cart/orders/loyalty off."""
    make_plan_settings(organization_a, plan=PRO)
    # AI features ON
    for feature in (
        "ai_pdf_import_enabled",
        "ai_translate_enabled",
        "advanced_analytics_enabled",
    ):
        assert has_feature(organization_a, feature) is True
    # Commerce + loyalty OFF
    for feature in (
        "cart_enabled",
        "orders_enabled",
        "loyalty_enabled",
        "customer_accounts_enabled",
        "payments_enabled",
    ):
        assert has_feature(organization_a, feature) is False


def test_has_feature_orders_cart_only(make_plan_settings, organization_a):
    """ORDERS: cart + orders on, loyalty + payments + customer_accounts off."""
    make_plan_settings(organization_a, plan=ORDERS)
    # Commerce ON
    assert has_feature(organization_a, "cart_enabled") is True
    assert has_feature(organization_a, "orders_enabled") is True
    # Loyalty / payments / customer accounts OFF
    for feature in (
        "loyalty_enabled",
        "payments_enabled",
        "customer_accounts_enabled",
    ):
        assert has_feature(organization_a, feature) is False
    # AI flags ON
    for feature in (
        "ai_pdf_import_enabled",
        "ai_translate_enabled",
        "advanced_analytics_enabled",
    ):
        assert has_feature(organization_a, feature) is True


# ---------------------------------------------------------------------------
# Operator override precedence
# ---------------------------------------------------------------------------


def test_manual_override_disables_feature_even_on_ops(
    make_plan_settings, organization_a
):
    """Operator can flip ``cart_enabled=False`` even when default is True."""
    make_plan_settings(organization_a, plan=OPS, features={"cart_enabled": False})
    assert has_feature(organization_a, "cart_enabled") is False
    # Other OPS defaults are still on.
    assert has_feature(organization_a, "orders_enabled") is True


def test_manual_override_enables_feature_even_on_basic(
    make_plan_settings, organization_a
):
    """Operator can flip ``cart_enabled=True`` on BASIC tenant."""
    make_plan_settings(organization_a, plan=BASIC, features={"cart_enabled": True})
    assert has_feature(organization_a, "cart_enabled") is True
    # Other BASIC defaults are still off.
    assert has_feature(organization_a, "loyalty_enabled") is False


# ---------------------------------------------------------------------------
# Input-shape polymorphism
# ---------------------------------------------------------------------------


def test_has_feature_with_organization_instance(
    make_plan_settings, organization_a
):
    make_plan_settings(organization_a, plan=PRO)
    assert has_feature(organization_a, "ai_translate_enabled") is True


def test_has_feature_with_plansettings_instance(
    make_plan_settings, organization_a
):
    make_plan_settings(organization_a, plan=PRO)
    ps = get_plan_settings(organization_a)
    assert has_feature(ps, "ai_translate_enabled") is True
    # Unknown feature returns False (safe default — "no, you can't use
    # something you didn't ask for by name").
    assert has_feature(ps, "definitely_not_a_real_feature") is False


# ---------------------------------------------------------------------------
# Bonus: require_feature audit + raise
# ---------------------------------------------------------------------------


def test_require_feature_raises_when_disabled(
    make_plan_settings, organization_a
):
    from apps.audit.models import AuditEvent

    make_plan_settings(organization_a, plan=BASIC)
    with pytest.raises(FeatureDisabled):
        require_feature(organization_a, "orders_enabled", actor=None)

    # Audit row recorded.
    audit_rows = AuditEvent.objects.filter(
        organization=organization_a,
        action="feature_disabled_access",
        target_type="plan_settings",
    )
    assert audit_rows.count() == 1
    assert audit_rows.first().payload["feature"] == "orders_enabled"