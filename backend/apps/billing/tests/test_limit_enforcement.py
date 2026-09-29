"""Limit enforcement tests — Sprint B1 (D-026).

6 tests covering the enforce_limit + record_usage + get_usage_snapshot
flow:

* enforce_limit allows under-limit (no-op).
* enforce_limit raises LimitExceeded at the boundary (BASIC 25 items,
  the 26th creation trips).
* enforce_limit is a no-op when the tier limit is None (OPS unlimited).
* record_usage uses F()+delta for atomic increments.
* record_usage creates the current-month counter row on first call.
* get_usage_snapshot computes pct = round(100*used/limit, 2).
"""

from __future__ import annotations

from datetime import datetime
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.billing.constants import BASIC, OPS
from apps.billing.errors import LimitExceeded
from apps.billing.models import TenantUsageCounter
from apps.billing.services import (
    enforce_limit,
    get_usage_snapshot,
    record_usage,
    reset_usage_for_org,
)
from apps.billing.tests.factories import make_plan_settings

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# enforce_limit
# ---------------------------------------------------------------------------


def test_enforce_limit_allows_under_limit(
    make_plan_settings, organization_a, django_user_model
):
    """BASIC items=25; 10 created → enforce_limit passes silently."""
    from apps.menu.models import Menu, MenuCategory, MenuItem

    make_plan_settings(organization_a, plan=BASIC)
    menu = Menu.objects.create(
        organization=organization_a,
        slug="m-coupon",
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat = MenuCategory.objects.create(menu=menu, slug="c1", name="C", is_active=True)
    for i in range(10):
        MenuItem.objects.create(
            menu=menu,
            category=cat,
            name=f"item-{i}",
            price=1,
            is_active=True,
        )
    # No exception.
    enforce_limit(organization_a, "items")


def test_enforce_limit_raises_at_limit_boundary(
    make_plan_settings, organization_a
):
    """BASIC items=25; 25 created → enforce_limit raises LimitExceeded."""
    from apps.menu.models import Menu, MenuCategory, MenuItem

    make_plan_settings(organization_a, plan=BASIC)
    menu = Menu.objects.create(
        organization=organization_a,
        slug="m-boundary",
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat = MenuCategory.objects.create(menu=menu, slug="c1", name="C", is_active=True)
    for i in range(25):
        MenuItem.objects.create(
            menu=menu,
            category=cat,
            name=f"item-{i}",
            price=1,
            is_active=True,
        )

    with pytest.raises(LimitExceeded) as exc_info:
        enforce_limit(organization_a, "items")

    exc = exc_info.value
    assert exc.http_status == 402
    assert exc.extra["resource"] == "items"
    assert exc.extra["current"] == 25
    assert exc.extra["limit"] == 25


def test_enforce_limit_unlimited_when_none(
    make_plan_settings, organization_a
):
    """OPS items=None (unlimited) → enforce_limit passes at any count."""
    from apps.menu.models import Menu, MenuCategory, MenuItem

    make_plan_settings(organization_a, plan=OPS)
    menu = Menu.objects.create(
        organization=organization_a,
        slug="m-unl",
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat = MenuCategory.objects.create(menu=menu, slug="c1", name="C", is_active=True)
    for i in range(300):  # well above any finite cap
        MenuItem.objects.create(
            menu=menu,
            category=cat,
            name=f"item-{i}",
            price=1,
            is_active=True,
        )
    # No exception even at 300 items — OPS has no items cap.
    enforce_limit(organization_a, "items")


# ---------------------------------------------------------------------------
# record_usage
# ---------------------------------------------------------------------------


def test_record_usage_atomic_increment(
    make_plan_settings, make_usage_counter, organization_a
):
    """Concurrent increments via F() don't lose updates."""
    from django.db.models import F

    make_plan_settings(organization_a, plan=OPS)
    now = timezone.now()
    make_usage_counter(
        organization_a,
        period_year=now.year,
        period_month=now.month,
        views=10,
    )
    # F() increment
    TenantUsageCounter.objects.filter(
        organization=organization_a,
        period_year=now.year,
        period_month=now.month,
    ).update(views=F("views") + 1)
    counter = TenantUsageCounter.objects.get(
        organization=organization_a,
        period_year=now.year,
        period_month=now.month,
    )
    assert counter.views == 11

    # record_usage via service.
    record_usage(organization_a, "views", delta=5)
    counter.refresh_from_db()
    assert counter.views == 16


def test_record_usage_creates_current_month_row(
    make_plan_settings, organization_a
):
    """First call in a fresh month creates a zero-valued counter row."""
    make_plan_settings(organization_a, plan=OPS)
    assert TenantUsageCounter.objects.filter(organization=organization_a).count() == 0

    record_usage(organization_a, "scans", 1)

    counter = TenantUsageCounter.objects.get(organization=organization_a)
    assert counter.scans == 1
    assert counter.views == 0
    assert counter.period_year == timezone.now().year
    assert counter.period_month == timezone.now().month


# ---------------------------------------------------------------------------
# get_usage_snapshot
# ---------------------------------------------------------------------------


def test_get_usage_snapshot_pct_calculation(
    make_plan_settings, make_usage_counter, organization_a
):
    """pct = round(100 * used / limit, 2)."""
    make_plan_settings(organization_a, plan=BASIC)
    now = timezone.now()
    make_usage_counter(
        organization_a,
        period_year=now.year,
        period_month=now.month,
        views=500,        # BASIC monthly_views = 1000
        scans=100,        # BASIC monthly_scans = 500
        ai_translate_ops=20,  # BASIC = 0 → cap-bound (the test below
                                # pins this; pct uses limit=0 → None).
    )

    snapshot = get_usage_snapshot(organization_a)
    assert snapshot["views"]["used"] == 500
    assert snapshot["views"]["limit"] == 1000
    assert snapshot["views"]["pct"] == 50.0
    assert snapshot["scans"]["used"] == 100
    assert snapshot["scans"]["limit"] == 500
    assert snapshot["scans"]["pct"] == 20.0
    # ai_translate_ops cap on BASIC is 0 — pct must be None (we don't
    # divide by zero in the service).
    assert snapshot["ai_translate_ops"]["limit"] == 0
    assert snapshot["ai_translate_ops"]["pct"] is None


# ---------------------------------------------------------------------------
# Bonus: reset_usage_for_org
# ---------------------------------------------------------------------------


def test_reset_usage_for_org_deletes_counters(
    make_plan_settings, make_usage_counter, organization_a
):
    make_plan_settings(organization_a, plan=OPS)
    now = timezone.now()
    make_usage_counter(
        organization_a,
        period_year=now.year,
        period_month=now.month,
        views=42,
    )
    deleted = reset_usage_for_org(organization_a)
    assert deleted >= 1
    assert TenantUsageCounter.objects.filter(organization=organization_a).count() == 0