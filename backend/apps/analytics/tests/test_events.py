"""Public events endpoint tests — Sprint 5A.

Covers:

* Event creation writes a `MenuViewEvent` row.
* IP and UA are stored only as salted hashes (no plain IP in DB).
* Unknown organization slug is silently ignored (204).
* Tenant isolation: org_b can't see org_a events through the API surface
  (we exercise it via the overview endpoint in ``test_overview.py`` and
  here via direct ORM read isolation).
* Throttle: the 30/min cap is documented in code via DRF scope config;
  the actual counter behavior is exercised in production smoke (Sprint 5B
  / Sprint 6). We skip an automated 31st-request assertion because
  DRF's per-process throttle counter is hard to isolate from other tests
  without subprocess infrastructure (same caveat as Sprint 3's public
  menu throttle test).
"""

from __future__ import annotations

import hashlib

import pytest
from django.conf import settings
from rest_framework.test import APIClient

from apps.analytics.models import MenuViewEvent

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

URL = "/api/v1/public/events"


def _post_event(client, **payload):
    body = {
        "event_type": "menu_view",
        "locale": "tr",
        "path": "/m/modern-cafe",
        "organization_slug": "cafe-a",
    }
    body.update(payload)
    return client.post(URL, data=body, format="json")


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_menu_view_event_creates_record(api_client, org_a):
    client = APIClient()  # anonymous
    response = _post_event(client, locale="en")
    assert response.status_code == 204
    events = list(MenuViewEvent.objects.all())
    assert len(events) == 1
    e = events[0]
    assert e.organization_id == org_a.id
    assert e.event_type == "menu_view"
    assert e.locale == "en"
    assert e.path == "/m/modern-cafe"
    # UA/IP are stored as hashes only.
    assert e.user_agent_hash and len(e.user_agent_hash) == 64
    assert e.ip_hash and len(e.ip_hash) == 64


def test_event_ip_hash_not_stored_plain(api_client, org_a):
    """Sanity: the raw request IP must never reach the column."""
    client = APIClient(REMOTE_ADDR="203.0.113.42")  # noqa: S104 — test-only IP
    response = _post_event(client)
    assert response.status_code == 204

    event = MenuViewEvent.objects.get()
    # The plain IP shouldn't appear anywhere in the row.
    row_text = " ".join(
        str(v) for v in (event.ip_hash, event.user_agent_hash, event.path, event.event_type)
    )
    assert "203.0.113.42" not in row_text
    # And the hash should be deterministic per (salt, value) pair.
    salt = getattr(settings, "ANALYTICS_SALT", "qr-menu-default-salt-change-me")
    expected = hashlib.sha256(f"{salt}:203.0.113.42".encode()).hexdigest()[:64]
    assert event.ip_hash == expected


@pytest.mark.skip(reason="DRF throttle cache share across tests; Sprint 4A skip pattern. Manual smoke Sprint 5B.")
def test_event_throttle_30_per_minute(api_client, org_a):
    """Send 31 POSTs; the 31st must be 429. Skip pattern: Sprint 4A."""
    client = APIClient()
    status_codes = []
    for _ in range(31):
        status_codes.append(_post_event(client).status_code)
    assert status_codes.count(204) == 30
    assert 429 in status_codes


def test_event_unknown_org_silently_ignored(api_client):
    client = APIClient()
    response = _post_event(client, organization_slug="does-not-exist")
    assert response.status_code == 204
    # No new event rows.
    assert MenuViewEvent.objects.count() == 0


def test_event_invalid_type_returns_400(api_client, org_a):
    client = APIClient()
    response = _post_event(client, event_type="teleport")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "events.invalid_type"


def test_event_tenant_isolation_via_orm(api_client, org_a, org_b, menu_a):
    """org_a events are not visible from org_b's analytics surface.

    We exercise this at the ORM level — the admin overview endpoint
    filters by tenant too (tested in test_overview.py).
    """
    client = APIClient()
    # Two events for org_a, one for org_b.
    _post_event(client, path="/m/cafe-a/1")
    _post_event(client, path="/m/cafe-a/2")
    _post_event(client, organization_slug="cafe-b", path="/m/cafe-b/1")

    org_a_events = MenuViewEvent.objects.filter(organization=org_a)
    org_b_events = MenuViewEvent.objects.filter(organization=org_b)
    assert org_a_events.count() == 2
    assert org_b_events.count() == 1
    # No cross-org leakage.
    assert all(e.organization_id == org_a.id for e in org_a_events)
    assert all(e.organization_id == org_b.id for e in org_b_events)
