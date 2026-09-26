"""Order HTTP view tests \u2014 Sprint 8A (D-022).

Covers:

* ``POST /api/v1/public/orders`` \u2014 validation, success, audit event.
* ``GET  /api/v1/public/orders/{number}/status`` \u2014 success + 404.
* ``GET  /api/v1/admin/orders`` \u2014 list, status/date filters, tenant scope.
* ``GET  /api/v1/admin/orders/{id}`` \u2014 detail, cross-tenant 404.
* ``POST /api/v1/admin/orders/{id}/status`` \u2014 transition + audit.
* ``GET  /api/v1/admin/kitchen/tickets`` \u2014 default filter + filter override.

Throttle behaviour is *not* tested here for two reasons:

1. DRF stores the throttle cache per-process; isolating it across tests
   requires significant ceremony (see SPRINT_4A + the skip note in
   ``apps/analytics/tests/test_events.py``).
2. The throttle is configuration, not business logic \u2014 manual smoke
   (one order POST \u2192 expect 201, >20 POSTs/min from same IP \u2192 expect 429).
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.audit.models import AuditEvent
from apps.orders.models import Order, OrderItem
from apps.orders.services import transition_status

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


# ---------------------------------------------------------------------------
# Public POST
# ---------------------------------------------------------------------------
def test_public_post_creates_order_with_correct_data(
    api_client, org_a, item_a, item_b
):
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Mehmet",
            "customer_phone": "+905320000000",
            "items": [
                {"menu_item_id": item_a.id, "quantity": 2},
                {"menu_item_id": item_b.id, "quantity": 1},
            ],
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()["data"]
    assert body["status"] == "pending"
    assert body["total_amount"] == "120.00"
    assert body["currency"] == "TRY"
    # An order row was actually written.
    assert Order.objects.filter(order_number=body["order_number"]).exists()


def test_public_post_records_order_placed_audit_event(
    api_client, org_a, item_a
):
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Audit Visitor",
            "customer_phone": "5550000099",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
        },
        format="json",
    )
    assert response.status_code == 201
    order_number = response.json()["data"]["order_number"]
    order = Order.objects.get(order_number=order_number)
    event = AuditEvent.objects.filter(
        target_type="order", target_id=order.id
    ).get()
    assert event.action == "order_placed"
    assert event.payload["order_number"] == order_number
    assert event.payload["item_count"] == 1


def test_public_post_validates_required_fields(api_client, org_a):
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "",
            "customer_phone": "",
            "items": [],
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.invalid_payload"


def test_public_post_unknown_org_returns_404(api_client, item_a):
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": "nope-no-such-business",
            "customer_name": "X",
            "customer_phone": "5551234567",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
        },
        format="json",
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "business.not_found"


def test_public_post_rejects_unavailable_items(api_client, org_a, item_unavailable):
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "X",
            "customer_phone": "5551234567",
            "items": [
                {"menu_item_id": item_unavailable.id, "quantity": 1}
            ],
        },
        format="json",
    )
    # Service-layer ValidationError surfaces as 400 with code
    # ``order.validation_failed``.
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.validation_failed"


# ---------------------------------------------------------------------------
# Public GET status
# ---------------------------------------------------------------------------
def test_public_get_status_returns_200(api_client, order_a):
    response = api_client.get(
        f"/api/v1/public/orders/{order_a.order_number}/status"
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["order_number"] == order_a.order_number
    assert body["status"] == "pending"
    assert body["placed_at"] is not None
    assert body["confirmed_at"] is None


def test_public_get_status_unknown_returns_404(api_client):
    response = api_client.get("/api/v1/public/orders/NOPE-20991231-999/status")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "order.not_found"


def test_public_get_status_no_auth_required(api_client, order_a):
    """No Authorization header. Request must still be served."""
    response = api_client.get(
        f"/api/v1/public/orders/{order_a.order_number}/status"
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Admin list / detail / status update
# ---------------------------------------------------------------------------
def test_admin_list_tenant_scoped(api_client, org_a, org_b, order_a):
    """User A sees own order, NOT user B's order."""
    # Order under org_b that must NOT appear in org_a's list.
    Order.objects.create(
        organization=org_b,
        order_number="CB-20991231-001",
        customer_name="B",
        customer_phone="555",
        total_amount=Decimal("50.00"),
        status="pending",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/orders/")
    assert response.status_code == 200
    results = response.json()["data"]["results"]
    order_numbers = [r["order_number"] for r in results]
    assert order_a.order_number in order_numbers
    assert not any(n.startswith("CB-") for n in order_numbers)


def test_admin_list_filters_by_status(api_client, org_a, order_a):
    # Add a confirmed order to verify the filter narrows results.
    Order.objects.create(
        organization=org_a,
        order_number="CA-20991231-002",
        customer_name="X",
        customer_phone="555",
        total_amount=Decimal("50.00"),
        status="confirmed",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/orders/?status=pending")
    assert response.status_code == 200
    statuses = [r["status"] for r in response.json()["data"]["results"]]
    assert all(s == "pending" for s in statuses)
    assert order_a.order_number in [r["order_number"] for r in response.json()["data"]["results"]]


def test_admin_list_invalid_status_returns_400(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/orders/?status=bogus")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.invalid_status"


def test_admin_detail_returns_full_order(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.get(f"/api/v1/admin/orders/{order_a.pk}")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["order_number"] == order_a.order_number
    assert body["customer_name"] == "Ali"
    assert body["status"] == "pending"
    assert len(body["items"]) == 1
    assert body["items"][0]["name"] == "Türk Kahvesi"


def test_admin_detail_cross_org_returns_404(api_client, org_a, org_b):
    """User A fetching B's order id must see 404, not the row."""
    b_order = Order.objects.create(
        organization=org_b,
        order_number="CB-20991231-001",
        customer_name="Hidden",
        customer_phone="555",
        total_amount=Decimal("10.00"),
        status="pending",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get(f"/api/v1/admin/orders/{b_order.pk}")
    assert response.status_code == 404


def test_admin_status_update_validates_transition(
    api_client, org_a, order_a
):
    _login(api_client, "owner-a@example.com")
    # pending -> delivered is illegal.
    response = api_client.post(
        f"/api/v1/admin/orders/{order_a.pk}/status",
        data={"status": "delivered"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.invalid_transition"


def test_admin_status_update_records_audit(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        f"/api/v1/admin/orders/{order_a.pk}/status",
        data={"status": "confirmed"},
        format="json",
    )
    assert response.status_code == 200
    events = AuditEvent.objects.filter(
        target_type="order", target_id=order_a.pk, action="order_confirmed"
    )
    assert events.exists()


def test_admin_status_update_missing_status_field(api_client, org_a, order_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        f"/api/v1/admin/orders/{order_a.pk}/status",
        data={},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.status_required"


def test_admin_status_update_not_found(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/orders/999999/status",
        data={"status": "confirmed"},
        format="json",
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Kitchen
# ---------------------------------------------------------------------------
def test_kitchen_tickets_returns_active_orders(api_client, org_a, order_a):
    """pending + confirmed + preparing by default."""
    Order.objects.create(
        organization=org_a,
        order_number="CA-20991231-009",
        customer_name="Delivered",
        customer_phone="555",
        total_amount=Decimal("10.00"),
        status="delivered",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/kitchen/tickets")
    assert response.status_code == 200
    tickets = response.json()["data"]
    order_numbers = [t["order_number"] for t in tickets]
    assert order_a.order_number in order_numbers
    # Delivered order must be hidden.
    assert not any(n.endswith("-009") for n in order_numbers)


def test_kitchen_tickets_filter_by_status(api_client, org_a, order_a):
    """Filtering with ``?status=confirmed`` excludes pending rows."""
    Order.objects.create(
        organization=org_a,
        order_number="CA-20991231-007",
        customer_name="Confirmed",
        customer_phone="555",
        total_amount=Decimal("10.00"),
        status="confirmed",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get(
        "/api/v1/admin/kitchen/tickets?status=confirmed"
    )
    assert response.status_code == 200
    statuses = [t["status"] for t in response.json()["data"]]
    assert statuses == ["confirmed"]


def test_kitchen_tickets_all_status(api_client, org_a, order_a):
    Order.objects.create(
        organization=org_a,
        order_number="CA-20991231-008",
        customer_name="Delivered",
        customer_phone="555",
        total_amount=Decimal("10.00"),
        status="delivered",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/kitchen/tickets?status=all")
    assert response.status_code == 200
    tickets = response.json()["data"]
    assert len(tickets) >= 2


def test_kitchen_tickets_invalid_status(api_client, org_a):
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/kitchen/tickets?status=bogus")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.invalid_status"


# ---------------------------------------------------------------------------
# Order number generator (small direct check)
# ---------------------------------------------------------------------------
def test_order_number_format(org_a):
    """First order for today uses 001 suffix."""
    from apps.orders.services import generate_order_number

    number = generate_order_number(org_a)
    today = number.split("-")[1]
    assert today.isdigit() and len(today) == 8
    # The slug prefix is the first 2 chars uppercased.
    assert number.startswith("CA-")
    assert number.endswith("-001")


# ---------------------------------------------------------------------------
# Tenant isolation on the public status endpoint \u2014 must work cross-tenant
# because customers don't authenticate. Just verify no leakage of
# internal fields (no phone/notes leak into the public payload).
# ---------------------------------------------------------------------------
def test_public_get_status_does_not_leak_internal_fields(
    api_client, org_a, order_a
):
    response = api_client.get(
        f"/api/v1/public/orders/{order_a.order_number}/status"
    )
    body = response.json()["data"]
    assert "customer_phone" not in body
    assert "notes" not in body
    assert "total_amount" not in body
