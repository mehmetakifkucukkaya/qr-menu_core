"""Order security tests \u2014 Sprint 8A (D-022).

Auth model:
* Public endpoints (``/public/orders`` POST + GET) accept anonymous
  requests; they MUST NOT leak data they shouldn't.
* Admin endpoints require ``IsAuthenticated`` AND ``IsOrganizationMember``;
  a user without membership gets 403, a user with a *different* org
  gets 404 (no existence leak).

Order-number uniqueness is enforced both at the DB level (``unique=True``)
and at the service level (``generate_order_number`` retry loop).
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.orders.models import Order

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


# ---------------------------------------------------------------------------
# Auth \u2014 public endpoints are anonymous
# ---------------------------------------------------------------------------
def test_public_post_no_auth_required(api_client, org_a, item_a):
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Anon",
            "customer_phone": "5550000000",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
        },
        format="json",
    )
    assert response.status_code == 201


def test_public_get_status_no_auth_required(api_client, order_a):
    response = api_client.get(
        f"/api/v1/public/orders/{order_a.order_number}/status"
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Auth \u2014 admin endpoints require login
# ---------------------------------------------------------------------------
def test_admin_list_requires_authentication(api_client):
    response = api_client.get("/api/v1/admin/orders/")
    assert response.status_code in (401, 403)


def test_admin_detail_requires_authentication(api_client, order_a):
    response = api_client.get(f"/api/v1/admin/orders/{order_a.pk}")
    assert response.status_code in (401, 403)


def test_admin_status_update_requires_authentication(api_client, order_a):
    response = api_client.post(
        f"/api/v1/admin/orders/{order_a.pk}/status",
        data={"status": "confirmed"},
        format="json",
    )
    assert response.status_code in (401, 403)


def test_kitchen_tickets_requires_authentication(api_client):
    response = api_client.get("/api/v1/admin/kitchen/tickets")
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Tenant isolation
# ---------------------------------------------------------------------------
def test_admin_status_update_requires_org_membership(
    api_client, admin_user, org_a, order_a
):
    """Platform-admin (no membership) cannot access tenant-scoped data.

    The endpoint sits behind ``IsOrganizationMember`` which blocks
    users whose first membership is None. The order stays hidden.
    """
    # Log in as the platform admin (no org membership).
    api_client.post(
        "/api/v1/auth/login",
        data={"email": admin_user.email, "password": "test-pass-123"},
        format="json",
    )
    response = api_client.post(
        f"/api/v1/admin/orders/{order_a.pk}/status",
        data={"status": "confirmed"},
        format="json",
    )
    # Without an org the view returns 404 because there's no scope to
    # query against \u2014 we treat absence-of-org the same as missing row.
    assert response.status_code == 404


def test_cross_org_order_access_denied(api_client, org_a, org_b):
    """User B's owner must never see User A's order, even by id."""
    a_order = Order.objects.create(
        organization=org_a,
        order_number="CA-20991231-001",
        customer_name="A",
        customer_phone="555",
        total_amount=Decimal("10.00"),
        status="pending",
    )
    _login(api_client, "owner-b@example.com")
    # B sees nothing (their org has no orders yet).
    list_response = api_client.get("/api/v1/admin/orders/")
    assert list_response.status_code == 200
    assert list_response.json()["data"]["results"] == []

    detail_response = api_client.get(f"/api/v1/admin/orders/{a_order.pk}")
    assert detail_response.status_code == 404

    # Status update also blocked.
    update_response = api_client.post(
        f"/api/v1/admin/orders/{a_order.pk}/status",
        data={"status": "confirmed"},
        format="json",
    )
    assert update_response.status_code == 404


# ---------------------------------------------------------------------------
# Cross-tenant kitchen isolation
# ---------------------------------------------------------------------------
def test_kitchen_tickets_tenant_scoped(api_client, org_a, org_b, order_a):
    Order.objects.create(
        organization=org_b,
        order_number="CB-20991231-099",
        customer_name="Foreign",
        customer_phone="555",
        total_amount=Decimal("5.00"),
        status="pending",
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/kitchen/tickets")
    order_numbers = [t["order_number"] for t in response.json()["data"]]
    assert order_a.order_number in order_numbers
    assert not any(n.startswith("CB-") for n in order_numbers)


# ---------------------------------------------------------------------------
# DB-level constraints
# ---------------------------------------------------------------------------
def test_order_number_unique_constraint(org_a):
    """DB must reject a duplicate order_number even if the service bug
    ever let two requests past the counter loop."""
    Order.objects.create(
        organization=org_a,
        order_number="DUP-20991231-001",
        customer_name="First",
        customer_phone="555",
        total_amount=Decimal("10.00"),
        status="pending",
    )
    with pytest.raises(IntegrityError):
        Order.objects.create(
            organization=org_a,
            order_number="DUP-20991231-001",
            customer_name="Second",
            customer_phone="555",
            total_amount=Decimal("10.00"),
            status="pending",
        )


def test_order_total_amount_rejects_negative(org_a):
    """DecimalField validator (OP-6) blocks negative totals."""
    from django.core.exceptions import ValidationError

    order = Order(
        organization=org_a,
        order_number="NEG-20991231-001",
        customer_name="X",
        customer_phone="555",
        total_amount=Decimal("-1.00"),
        status="pending",
    )
    with pytest.raises(ValidationError):
        order.full_clean()
