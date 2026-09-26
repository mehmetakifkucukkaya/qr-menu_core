"""Admin analytics overview endpoint tests — Sprint 5A.

Covers:

* GET /api/v1/admin/analytics/overview returns counts + breakdown.
* Daily aggregation works (TruncDate by created_at).
* Language distribution is a per-locale ratio.
* Top QR codes ordered by ``scan_count`` desc, limit 5.
* Tenant isolation: org_b events absent from org_a's payload.
"""

from __future__ import annotations

import datetime

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.analytics.models import MenuViewEvent
from apps.qr.models import QRCode

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

URL = "/api/v1/admin/analytics/overview"


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def _seed_event(
    organization,
    *,
    event_type="menu_view",
    locale="tr",
    menu=None,
    path="/m/test",
    created_at=None,
    user_agent_hash="a" * 64,
    ip_hash="b" * 64,
):
    """Create a MenuViewEvent with a *specific* created_at.

    ``auto_now_add`` on ``created_at`` makes ``.create()`` ignore any
    value we pass in the constructor. To pin an event to a non-default
    timestamp we create with ``timezone.now()`` and then ``.update()``
    the field — ``update()`` is not affected by ``auto_now_add``.
    """
    event = MenuViewEvent.objects.create(
        organization=organization,
        menu=menu,
        event_type=event_type,
        locale=locale,
        path=path,
        user_agent_hash=user_agent_hash,
        ip_hash=ip_hash,
    )
    if created_at is not None:
        MenuViewEvent.objects.filter(pk=event.pk).update(created_at=created_at)
        event.refresh_from_db()
    return event


def _seed_events(organization, *, menu=None, count_by_type=None, days_ago=0):
    """Seed MenuViewEvent rows alternating TR / EN locales."""
    count_by_type = count_by_type or {"menu_view": 1}
    now = timezone.now() - datetime.timedelta(days=days_ago)
    for event_type, n in count_by_type.items():
        for i in range(n):
            _seed_event(
                organization,
                event_type=event_type,
                locale="tr" if i % 2 == 0 else "en",
                menu=menu,
                path=f"/m/{organization.slug}/{i}",
                created_at=now - datetime.timedelta(seconds=i),
            )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_overview_requires_authentication(api_client):
    client = APIClient()
    response = client.get(URL)
    # 401/403 both acceptable for "anonymous".
    assert response.status_code in (401, 403)


def test_overview_returns_counts(api_client, org_a, menu_a):
    _seed_events(
        org_a,
        menu=menu_a,
        count_by_type={"menu_view": 4, "language_change": 2, "whatsapp_click": 1},
        days_ago=0,
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get(URL)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["today_views"] == 7  # sum of all events seeded today
    assert payload["event_counts"]["menu_view"] == 4
    assert payload["event_counts"]["language_change"] == 2
    assert payload["event_counts"]["whatsapp_click"] == 1
    assert payload["event_counts"]["phone_click"] == 0
    assert payload["event_counts"]["qr_open"] == 0


def test_overview_daily_aggregation(api_client, org_a, menu_a):
    """Last 7 days get per-day buckets."""
    _seed_events(org_a, menu=menu_a, count_by_type={"menu_view": 3}, days_ago=0)
    _seed_events(org_a, menu=menu_a, count_by_type={"menu_view": 5}, days_ago=2)
    _seed_events(org_a, menu=menu_a, count_by_type={"menu_view": 2}, days_ago=10)  # outside window

    _login(api_client, "owner-a@example.com")
    response = api_client.get(f"{URL}?days=7")
    assert response.status_code == 200
    daily = response.json()["data"]["daily_views"]
    counts_by_date = {row["date"]: row["count"] for row in daily}
    today_key = timezone.now().date().isoformat()
    assert counts_by_date.get(today_key) == 3
    two_days_ago = (timezone.now().date() - datetime.timedelta(days=2)).isoformat()
    assert counts_by_date.get(two_days_ago) == 5
    # The 10-day-old event is outside the window.
    ten_days_ago = (timezone.now().date() - datetime.timedelta(days=10)).isoformat()
    assert ten_days_ago not in counts_by_date


def test_overview_language_distribution(api_client, org_a, menu_a):
    """Language distribution is a 0..1 ratio per locale."""
    # Seed 6 events alternating TR/EN/TR/EN/TR/EN (3 each).
    _seed_events(org_a, menu=menu_a, count_by_type={"menu_view": 6}, days_ago=0)
    # Add 1 extra TR row so TR dominates.
    _seed_event(
        org_a,
        event_type="menu_view",
        locale="tr",
        menu=menu_a,
        path="/m/tr-extra",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get(URL)
    payload = response.json()["data"]
    dist = payload["language_distribution"]
    assert abs(sum(dist.values()) - 1.0) < 1e-9
    # 4 TR out of 7 → tr=4/7=0.5714, en=3/7=0.4286.
    assert dist.get("tr", 0) > dist.get("en", 0)
    assert abs(dist["tr"] - 4 / 7) < 1e-3
    assert abs(dist["en"] - 3 / 7) < 1e-3


def test_overview_top_qr_codes(api_client, org_a, menu_a):
    """Top QR codes sorted by scan_count desc, capped at 5."""
    # Create 7 QR codes with varying scan counts.
    qr_codes = [
        QRCode.objects.create(
            organization=org_a,
            menu=menu_a,
            label=f"QR{i}",
            scan_count=10 - i,
        )
        for i in range(7)
    ]
    _login(api_client, "owner-a@example.com")
    response = api_client.get(URL)
    payload = response.json()["data"]
    top = payload["top_qr_codes"]
    assert len(top) == 5
    # Sorted desc by scan_count.
    scan_counts = [r["scan_count"] for r in top]
    assert scan_counts == sorted(scan_counts, reverse=True)
    # The highest-scoring row is the first we created (scan_count=10).
    assert top[0]["id"] == qr_codes[0].id
    assert top[0]["label"] == "QR0"


def test_overview_tenant_isolation(api_client, org_a, org_b, menu_a):
    """org_b events don't leak into org_a's overview."""
    _seed_events(org_a, menu=menu_a, count_by_type={"menu_view": 3}, days_ago=0)
    _seed_events(org_b, menu=menu_a, count_by_type={"menu_view": 9}, days_ago=0)

    _login(api_client, "owner-a@example.com")
    response = api_client.get(URL)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["today_views"] == 3  # only org_a's events
    assert payload["event_counts"]["menu_view"] == 3


def test_overview_empty_org_returns_zero_payload(api_client, org_a):
    """First-run tenant with no events gets a benign empty payload (200)."""
    _login(api_client, "owner-a@example.com")
    response = api_client.get(URL)
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["today_views"] == 0
    assert payload["week_views"] == 0
    assert payload["month_views"] == 0
    assert all(v == 0 for v in payload["event_counts"].values())
    assert payload["top_qr_codes"] == []
    assert payload["daily_views"] == []
    assert payload["language_distribution"] == {}
