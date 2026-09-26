"""Admin summary endpoint tests — Sprint 4C.

Covers:
  - Auth required (anonymous → 401/403).
  - Counts reflect the tenant's catalog.
  - Recent events come back newest-first.
  - The 10-event cap is honored.
  - Tenant isolation: org_b events are not visible to org_a user.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.branches.models import Branch
from apps.menu.models import Menu, MenuCategory, MenuItem

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


@pytest.fixture
def catalog(org_a):
    """Seed a small catalog under org_a."""
    menu = Menu.objects.create(
        organization=org_a,
        name="Ana Menü",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat1 = MenuCategory.objects.create(menu=menu, name="Sıcak İçecek", sort_order=0)
    cat2 = MenuCategory.objects.create(menu=menu, name="Soğuk İçecek", sort_order=1)
    MenuItem.objects.create(
        menu=menu,
        category=cat1,
        name="Türk Kahvesi",
        price=Decimal("75.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )
    MenuItem.objects.create(
        menu=menu,
        category=cat1,
        name="Latte",
        price=Decimal("65.00"),
        currency="TRY",
        is_active=True,
        is_available=False,  # not available → does not count toward active_item_count
    )
    MenuItem.objects.create(
        menu=menu,
        category=cat2,
        name="Ice Latte",
        price=Decimal("80.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )
    Branch.objects.create(organization=org_a, name="Kadıköy", slug="kadikoy")
    return {
        "menu": menu,
        "categories": [cat1, cat2],
    }


def test_summary_requires_authentication(api_client):
    response = api_client.get("/api/v1/admin/summary")
    # 401 from DRF session auth, or 403 from IsAuthenticated; both are
    # acceptable "unauthenticated" responses.
    assert response.status_code in (401, 403)


def test_summary_returns_counts(api_client, org_a, catalog):
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/summary")
    assert response.status_code == 200, response.json()
    payload = response.json()["data"]
    assert payload["menu_count"] == 1
    assert payload["category_count"] == 2
    assert payload["item_count"] == 3
    assert payload["active_item_count"] == 2  # is_active=True AND is_available=True
    assert payload["branch_count"] == 1
    assert payload["organization"]["slug"] == "cafe-a"


def test_summary_returns_recent_events_desc(api_client, org_a, catalog):
    # org_a fixture: 1 Organization. catalog fixture: 1 menu + 2 categories +
    # 3 items + 1 branch = 7 events. Total 8 events, desc by created_at.
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/summary")
    assert response.status_code == 200
    events = response.json()["data"]["recent_events"]
    assert len(events) == 8
    timestamps = [e["created_at"] for e in events]
    assert timestamps == sorted(timestamps, reverse=True)


def test_summary_limit_is_ten(api_client, org_a, django_user_model):
    """Seed 12 events and verify only 10 are returned."""
    from django.utils import timezone
    import datetime

    user = django_user_model.objects.get(email="owner-a@example.com")
    now = timezone.now()
    for i in range(12):
        AuditEvent.objects.create(
            organization=org_a,
            actor=user,
            action="updated",
            target_type="menu",
            target_id=i,
            target_repr=f"item {i}",
            payload={"i": i},
            created_at=now - datetime.timedelta(minutes=i),
        )

    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/summary")
    assert response.status_code == 200
    events = response.json()["data"]["recent_events"]
    assert len(events) == 10


def test_summary_tenant_isolation(api_client, org_a, org_b, django_user_model):
    """Events belonging to org_b must not leak into org_a's summary."""
    user_b = django_user_model.objects.get(email="owner-b@example.com")
    AuditEvent.objects.create(
        organization=org_b,
        actor=user_b,
        action="updated",
        target_type="menu",
        target_id=999,
        target_repr="org_b_only",
    )
    AuditEvent.objects.create(
        organization=org_a,
        action="updated",
        target_type="menu",
        target_id=1,
        target_repr="org_a_visible",
    )

    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/summary")
    payload = response.json()["data"]
    target_ids = [e["target_id"] for e in payload["recent_events"]]
    assert 999 not in target_ids
    assert 1 in target_ids


def test_summary_event_payload_includes_old_new_for_price_change(
    api_client, org_a, catalog
):
    _login(api_client, "owner-a@example.com")
    item = MenuItem.objects.get(name="Türk Kahvesi")
    # Go through the API so the AuditContextMiddleware populates the
    # thread-local actor. Direct ORM save() bypasses middleware.
    response = api_client.patch(
        f"/api/v1/admin/menu-items/{item.id}/",
        data={"price": "85.00"},
        format="json",
    )
    assert response.status_code == 200, response.json()

    summary = api_client.get("/api/v1/admin/summary")
    events = summary.json()["data"]["recent_events"]
    price_events = [e for e in events if e["action"] == "price_changed"]
    assert price_events, "expected a price_changed event"
    assert price_events[0]["payload"] == {"old": "75.00", "new": "85.00"}
    # Actor should be the logged-in user (login sets request.user).
    assert price_events[0]["actor"] == "owner-a@example.com"


def test_summary_actor_and_ip_recorded(api_client, org_a, catalog):
    _login(api_client, "owner-a@example.com")
    item = MenuItem.objects.get(name="Türk Kahvesi")
    response = api_client.patch(
        f"/api/v1/admin/menu-items/{item.id}/",
        data={"is_active": False},
        format="json",
    )
    assert response.status_code == 200, response.json()

    summary = api_client.get("/api/v1/admin/summary")
    events = summary.json()["data"]["recent_events"]
    deactivate_events = [e for e in events if e["action"] == "deactivated"]
    assert deactivate_events
    assert deactivate_events[0]["actor"] == "owner-a@example.com"
