"""Billing admin view tests — Sprint B1 (D-026).

7 tests covering the 6 admin endpoints + the upgrade preview helper:

* GET /api/v1/admin/billing/plan/ — happy path returns PlanSettings.
* PUT /api/v1/admin/billing/plan/ — happy path updates plan + audit.
* GET /api/v1/admin/billing/usage/ — current snapshot.
* GET /api/v1/admin/billing/limits/ — 4-tier matrix.
* POST /api/v1/admin/billing/limits/preview-upgrade/ — feature deltas
  computed correctly.
* POST /api/v1/admin/billing/reset-usage/ — superuser-only.
* GET unauthenticated → 401 (regression check).
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.billing.constants import BASIC, OPS, PRO
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# /admin/billing/plan/ — happy + audit
# ---------------------------------------------------------------------------


def test_get_plan_returns_settings(make_plan_settings, organization_a, user_a):
    make_plan_settings(organization_a, plan=PRO)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.get("/api/v1/admin/billing/plan/")
    assert res.status_code == 200, res.content
    body = res.json()["data"]
    assert body["active_plan"] == PRO
    # PRO defaults: ai_translate_enabled True, orders_enabled False.
    assert body["features"]["ai_translate_enabled"] is True
    assert body["features"]["orders_enabled"] is False


def test_put_plan_updates_and_audits(make_plan_settings, organization_a, user_a):
    make_plan_settings(organization_a, plan=BASIC)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.put(
        "/api/v1/admin/billing/plan/",
        data={"active_plan": "ops"},
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()["data"]
    assert body["active_plan"] == OPS
    # OPS defaults: every flag on.
    assert body["features"]["cart_enabled"] is True

    # Audit row recorded.
    audit_rows = AuditEvent.objects.filter(
        organization=organization_a,
        action="plan_changed",
        target_type="plan_settings",
    )
    assert audit_rows.count() == 1
    assert audit_rows.first().payload["before"]["active_plan"] == BASIC
    assert audit_rows.first().payload["after"]["active_plan"] == OPS


# ---------------------------------------------------------------------------
# /admin/billing/usage/
# ---------------------------------------------------------------------------


def test_get_usage_snapshot(make_plan_settings, organization_a, user_a, make_usage_counter):
    from django.utils import timezone

    make_plan_settings(organization_a, plan=BASIC)
    now = timezone.now()
    make_usage_counter(
        organization_a,
        period_year=now.year,
        period_month=now.month,
        views=500,
        scans=100,
    )
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.get("/api/v1/admin/billing/usage/")
    assert res.status_code == 200, res.content
    body = res.json()["data"]
    assert body["period_year"] == now.year
    assert body["period_month"] == now.month
    assert body["metrics"]["views"]["used"] == 500
    assert body["metrics"]["views"]["limit"] == 1000
    assert body["metrics"]["scans"]["used"] == 100
    assert body["metrics"]["scans"]["limit"] == 500


# ---------------------------------------------------------------------------
# /admin/billing/limits/
# ---------------------------------------------------------------------------


def test_get_limits_matrix(make_plan_settings, organization_a, user_a):
    make_plan_settings(organization_a, plan="orders")
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.get("/api/v1/admin/billing/limits/")
    assert res.status_code == 200, res.content
    body = res.json()["data"]
    assert body["current_plan"] == "orders"
    # 4 tiers exposed.
    tier_ids = [t["id"] for t in body["tiers"]]
    assert tier_ids == ["basic", "pro", "orders", "ops"]
    # Only ORDERS has is_current=True.
    current = [t for t in body["tiers"] if t["is_current"]]
    assert len(current) == 1
    assert current[0]["id"] == "orders"


# ---------------------------------------------------------------------------
# /admin/billing/limits/preview-upgrade/
# ---------------------------------------------------------------------------


def test_preview_upgrade_deltas_correct(
    make_plan_settings, organization_a, user_a
):
    """PRO → OPS preview should flag cart + orders + loyalty as up."""
    make_plan_settings(organization_a, plan=PRO)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.post(
        "/api/v1/admin/billing/limits/preview-upgrade/",
        data={"target_plan": "ops"},
        format="json",
    )
    assert res.status_code == 200, res.content
    body = res.json()["data"]
    assert body["current_plan"] == PRO
    assert body["target_plan"] == OPS
    # Feature deltas: every feature PRO-off + OPS-on should appear.
    flipped = {d["feature"] for d in body["feature_deltas"]}
    assert "cart_enabled" in flipped
    assert "orders_enabled" in flipped
    assert "loyalty_enabled" in flipped
    # Audit row recorded.
    assert AuditEvent.objects.filter(
        organization=organization_a,
        action="plan_upgraded_preview",
    ).count() == 1


# ---------------------------------------------------------------------------
# /admin/billing/reset-usage/
# ---------------------------------------------------------------------------


def test_reset_usage_superuser_only(
    make_plan_settings, make_usage_counter, organization_a, user_a, admin_user
):
    """Non-superuser → 403; superuser → 200 + row deleted."""
    from django.utils import timezone

    from apps.accounts.models import Membership, MembershipRole

    # The test fixture admin_user has is_superuser=True but no
    # membership; add one for this organization so the endpoint can
    # resolve which org to reset.
    Membership.objects.get_or_create(
        user=admin_user,
        organization=organization_a,
        defaults={"role": MembershipRole.OWNER},
    )

    make_plan_settings(organization_a, plan=OPS)
    now = timezone.now()
    make_usage_counter(
        organization_a,
        period_year=now.year,
        period_month=now.month,
        views=42,
    )

    # Non-superuser → 403 (superuser-only check fires before superuser
    # is checked). Note: the body shape is the {error: {...}} envelope
    # rather than the DRF default 403 because the view returns it
    # explicitly.
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.post("/api/v1/admin/billing/reset-usage/")
    assert res.status_code == 403
    assert "superuser" in str(res.content).lower()

    # Superuser → 200 + deleted count >= 1.
    client2 = APIClient()
    client2.force_authenticate(user=admin_user)
    res2 = client2.post("/api/v1/admin/billing/reset-usage/")
    assert res2.status_code == 200, res2.content
    assert res2.json()["data"]["reset_count"] >= 1


# ---------------------------------------------------------------------------
# Auth regression
# ---------------------------------------------------------------------------


def test_endpoint_unauthenticated_returns_4xx(organization_a):
    """Unauthenticated → 401 or 403 (project default is 403 via
    IsOrganizationMember + IsAuthenticated).
    """
    client = APIClient()
    for path in (
        "/api/v1/admin/billing/plan/",
        "/api/v1/admin/billing/usage/",
        "/api/v1/admin/billing/limits/",
    ):
        res = client.get(path)
        assert res.status_code in (401, 403), f"{path}: {res.status_code}"