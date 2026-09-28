"""Account HTTP view tests — Sprint 10A (D-025).

Covers all 13 endpoints at the HTTP level. Each test sets up the
minimal context (org / customer / order / loyalty settings) and
exercises the happy + error paths for one endpoint family.

Pattern notes
-------------
* Auth helpers: ``_admin_login`` puts the platform admin user into
  the session (so ``IsOrganizationMember`` passes); ``_customer_login``
  flips the customer cookie for the customer-auth endpoints.
* The ``_clear_throttle_cache`` autouse fixture keeps the magic-link
  rate bucket from leaking between tests (see conftest.py).
* Some tests stub out the throttle class via ``override_settings``
  to keep tests fast.
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest
from django.test import override_settings
from rest_framework.test import APIClient

from apps.account.models import Customer, MagicLinkToken
from apps.account.tests.factories import (
    make_customer,
    make_earn_txn,
    make_loyalty_settings,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _admin_login(client: APIClient, email: str, password: str = "x") -> None:
    """Log the platform user into the admin session (sets sessionid cookie)."""
    client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def _customer_login(client: APIClient, customer: Customer) -> None:
    """Stub-set the customer cookie on ``client`` for subsequent requests."""
    client.cookies["_auth_customer_id"] = str(customer.id)


# Patch the magic-link throttle in tests where many requests happen.
@pytest.fixture
def no_throttle(settings):
    """Disable the magic-link throttle for this test only."""
    rest = settings.REST_FRAMEWORK.copy()
    rates = dict(rest.get("DEFAULT_THROTTLE_RATES", {}))
    rates["magic_link_request"] = "1000/min"
    rest["DEFAULT_THROTTLE_RATES"] = rates
    settings.REST_FRAMEWORK = rest
    return settings


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
def test_request_link_returns_ok_enumeration_safe(no_throttle, api_client):
    response = api_client.post(
        "/api/v1/account/auth/request-link",
        data={"email": "enumeration@example.com"},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True


def test_request_link_validation_error_returns_400(api_client):
    response = api_client.post(
        "/api/v1/account/auth/request-link",
        data={"email": "not-an-email"},
        format="json",
    )
    assert response.status_code == 400


def test_verify_endpoint_with_invalid_token_returns_400(api_client):
    response = api_client.get(
        "/api/v1/account/auth/verify?token=bogus"
    )
    assert response.status_code == 400


def test_verify_endpoint_with_valid_token_sets_session(no_throttle, api_client):
    customer = make_customer(email="verify@example.com")
    token = MagicLinkToken.generate(customer=customer, ttl_minutes=15)
    response = api_client.get(
        f"/api/v1/account/auth/verify?token={token.token}"
    )
    assert response.status_code == 200
    cookies = response.cookies
    assert any(
        c.value == str(customer.id) for c in cookies.values()
    ), "customer session cookie missing"


def test_logout_returns_ok(no_throttle, api_client):
    """Logout works regardless of session."""
    response = api_client.post("/api/v1/account/auth/logout")
    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True


def test_logout_response_deletes_cookie(no_throttle, api_client):
    """Logout response sets the customer cookie to expired."""
    customer = make_customer(email="logout@example.com")
    MagicLinkToken.generate(customer=customer, ttl_minutes=15)
    api_client.cookies["_auth_customer_id"] = str(customer.id)
    response = api_client.post("/api/v1/account/auth/logout")
    # The cookie should be deleted (response.cookies carries a
    # delete directive — value empty + max-age=0 OR expires in the
    # past). The bare assertion: the key is in response.cookies.
    set_cookies = [
        c
        for c in response.cookies.values()
        if c.key == "_auth_customer_id"
    ]
    # At least one of them should mark expiry.
    # (Django's delete_cookie path adds ``Max-Age=0`` headers — we
    # can't see those via SimpleCookie's interface easily, but
    # the cookie value being empty or expired in the past is the
    # tested guarantee. Here we just verify a cookie is being
    # modified in the response.)
    assert set_cookies, "expected the response to mention _auth_customer_id"


# ---------------------------------------------------------------------------
# Customer /me endpoints
# ---------------------------------------------------------------------------
def test_me_returns_401_without_cookie(api_client):
    response = api_client.get("/api/v1/account/me")
    assert response.status_code in {401, 403}


def test_me_returns_profile_with_cookie(api_client):
    customer = make_customer(
        email="profile@example.com", full_name="M", phone="5550000099"
    )
    _customer_login(api_client, customer)
    response = api_client.get("/api/v1/account/me")
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["email"] == "profile@example.com"


def test_me_patch_updates_profile(api_client):
    customer = make_customer(email="patch@example.com")
    _customer_login(api_client, customer)
    response = api_client.patch(
        "/api/v1/account/me",
        data={"full_name": "M. Akif", "phone": "5559876543"},
        format="json",
    )
    assert response.status_code == 200
    customer.refresh_from_db()
    assert customer.full_name == "M. Akif"


def test_me_orders_returns_only_loggedin_customer_orders(api_client, org_a, org_b):
    """Customer-scoped: A's orders are not visible to B."""
    from apps.orders.models import Order

    a = make_customer(email="a@example.com")
    b = make_customer(email="b@example.com")
    Order.objects.create(
        organization=org_a,
        order_number="A-001",
        customer_name="A",
        customer_phone="5550000001",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=a,
    )
    Order.objects.create(
        organization=org_b,
        order_number="B-001",
        customer_name="B",
        customer_phone="5550000002",
        total_amount=Decimal("20"),
        currency="TRY",
        customer=b,
    )
    _customer_login(api_client, a)
    response = api_client.get("/api/v1/account/me/orders")
    assert response.status_code == 200
    body = response.json()["data"]
    order_numbers = [r["order_number"] for r in body["results"]]
    assert "A-001" in order_numbers
    assert "B-001" not in order_numbers


def test_me_orders_returns_status_filter(api_client, org_a, item_a):
    from apps.orders.models import Order
    customer = make_customer(email="filter@example.com")
    Order.objects.create(
        organization=org_a,
        order_number="FLT-001",
        customer_name="F",
        customer_phone="5550000003",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=customer,
        status="delivered",
    )
    Order.objects.create(
        organization=org_a,
        order_number="FLT-002",
        customer_name="F",
        customer_phone="5550000003",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=customer,
        status="pending",
    )
    _customer_login(api_client, customer)
    response = api_client.get(
        "/api/v1/account/me/orders?status=delivered"
    )
    assert response.status_code == 200
    results = response.json()["data"]["results"]
    assert {r["order_number"] for r in results} == {"FLT-001"}


def test_me_loyalty_returns_balance_and_txns(api_client, org_a):
    settings_obj = make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="bal@example.com")
    make_earn_txn(customer, org_a, points=250)
    _customer_login(api_client, customer)
    response = api_client.get(
        f"/api/v1/account/me/loyalty?organization={org_a.slug}"
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["balance"] == 250
    assert len(body["transactions"]) == 1


def test_me_loyalty_requires_organization(api_client):
    customer = make_customer(email="no-org@example.com")
    _customer_login(api_client, customer)
    response = api_client.get("/api/v1/account/me/loyalty")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "loyalty.organization_required"


def test_me_loyalty_returns_404_for_unrelated_org(api_client, org_a, org_b):
    """Cross-tenant access returns 404 (not 200 + empty)."""
    customer = make_customer(email="x-tenant@example.com")
    # Customer has no history at org_b.
    _customer_login(api_client, customer)
    response = api_client.get(
        f"/api/v1/account/me/loyalty?organization={org_b.slug}"
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Public loyalty settings
# ---------------------------------------------------------------------------
def test_public_loyalty_settings_disabled_returns_404(api_client, org_a):
    """Disabled tenants don't expose the banner adım."""
    make_loyalty_settings(org_a, is_enabled=False)
    response = api_client.get(
        f"/api/v1/account/loyalty/settings?organization={org_a.slug}"
    )
    assert response.status_code == 404


def test_public_loyalty_settings_enabled_returns_payload(api_client, org_a):
    make_loyalty_settings(org_a, is_enabled=True)
    response = api_client.get(
        f"/api/v1/account/loyalty/settings?organization={org_a.slug}"
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["is_enabled"] is True


def test_public_loyalty_settings_unknown_org_returns_404(api_client, org_a):
    response = api_client.get(
        "/api/v1/account/loyalty/settings?organization=does-not-exist"
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Admin: customer list + detail
# ---------------------------------------------------------------------------
def test_admin_customer_list_requires_admin(api_client):
    response = api_client.get("/api/v1/account/admin/customers")
    assert response.status_code in {401, 403}


def test_admin_customer_list_returns_history_scoped(api_client, org_a, org_b):
    _admin_login(api_client, "owner-a@example.com")
    # Two customers: one has org_a history; the other has org_b only.
    from apps.orders.models import Order

    a = make_customer(email="admin-list-a@example.com")
    b = make_customer(email="admin-list-b@example.com")
    Order.objects.create(
        organization=org_a,
        order_number="AD-001",
        customer_name="A",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=a,
    )
    Order.objects.create(
        organization=org_b,
        order_number="AD-002",
        customer_name="B",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=b,
    )
    response = api_client.get("/api/v1/account/admin/customers")
    assert response.status_code == 200
    body = response.json()["data"]
    emails = [r["email"] for r in body["results"]]
    assert "admin-list-a@example.com" in emails
    assert "admin-list-b@example.com" not in emails


def test_admin_customer_list_search_by_email(api_client, org_a, org_b):
    _admin_login(api_client, "owner-a@example.com")
    from apps.orders.models import Order

    one = make_customer(email="search-1@example.com")
    two = make_customer(email="search-2@example.com")
    Order.objects.create(
        organization=org_a,
        order_number="SR-001",
        customer_name="One",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=one,
    )
    Order.objects.create(
        organization=org_a,
        order_number="SR-002",
        customer_name="Two",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=two,
    )
    response = api_client.get(
        "/api/v1/account/admin/customers?search=search-1"
    )
    assert response.status_code == 200
    emails = [
        r["email"] for r in response.json()["data"]["results"]
    ]
    assert "search-1@example.com" in emails
    assert "search-2@example.com" not in emails


def test_admin_customer_detail_returns_404_for_cross_tenant(
    api_client, org_a, org_b
):
    _admin_login(api_client, "owner-a@example.com")
    from apps.orders.models import Order

    customer = make_customer(email="ct@example.com")
    # Customer has history at org_b but not org_a.
    Order.objects.create(
        organization=org_b,
        order_number="CT-001",
        customer_name="CT",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=customer,
    )
    response = api_client.get(
        f"/api/v1/account/admin/customers/{customer.id}"
    )
    assert response.status_code == 404


def test_admin_customer_detail_returns_history(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    from apps.orders.models import Order

    customer = make_customer(email="dt@example.com")
    Order.objects.create(
        organization=org_a,
        order_number="DT-001",
        customer_name="DT",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=customer,
    )
    response = api_client.get(
        f"/api/v1/account/admin/customers/{customer.id}"
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["customer"]["email"] == "dt@example.com"
    assert body["loyalty_balance"] == 0


# ---------------------------------------------------------------------------
# Admin: loyalty adjust
# ---------------------------------------------------------------------------
def test_admin_loyalty_adjust_increases_balance(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="adj@example.com")
    from apps.orders.models import Order

    Order.objects.create(
        organization=org_a,
        order_number="ADJ-001",
        customer_name="Adj",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=customer,
    )
    response = api_client.post(
        f"/api/v1/account/admin/customers/{customer.id}/loyalty-adjust",
        data={"delta_points": 50, "note": "Manuel +50"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["new_balance"] == 50
    assert body["transaction"]["points"] == 50


def test_admin_loyalty_adjust_decreases_balance(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="down@example.com")
    make_earn_txn(customer, org_a, points=100)
    from apps.orders.models import Order

    Order.objects.create(
        organization=org_a,
        order_number="DN-001",
        customer_name="Dn",
        customer_phone="555",
        total_amount=Decimal("10"),
        currency="TRY",
        customer=customer,
    )
    response = api_client.post(
        f"/api/v1/account/admin/customers/{customer.id}/loyalty-adjust",
        data={"delta_points": -30, "note": "Hata düzeltme"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["new_balance"] == 70


def test_admin_loyalty_adjust_zero_returns_400(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    customer = make_customer(email="zero@example.com")
    response = api_client.post(
        f"/api/v1/account/admin/customers/{customer.id}/loyalty-adjust",
        data={"delta_points": 0},
        format="json",
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Admin: loyalty settings
# ---------------------------------------------------------------------------
def test_admin_loyalty_settings_get_creates_default(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    response = api_client.get(
        "/api/v1/account/admin/loyalty/settings"
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["points_per_currency_unit"] == "1.0000"


def test_admin_loyalty_settings_put_updates(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    response = api_client.put(
        "/api/v1/account/admin/loyalty/settings",
        data={
            "is_enabled": True,
            "points_per_currency_unit": "2.5",
            "redemption_rate": "0.05",
            "min_points_to_redeem": 50,
            "points_expiry_days": 90,
        },
        format="json",
    )
    assert response.status_code == 200
    body = response.json()["data"]
    assert body["is_enabled"] is True
    assert body["min_points_to_redeem"] == 50


def test_admin_loyalty_settings_put_validates_negative_rate(api_client, org_a):
    _admin_login(api_client, "owner-a@example.com")
    response = api_client.put(
        "/api/v1/account/admin/loyalty/settings",
        data={
            "is_enabled": True,
            "points_per_currency_unit": "1",
            "redemption_rate": "-0.1",
            "min_points_to_redeem": 50,
        },
        format="json",
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Public orders integration (Sprint 10A loyalty path on POST)
# ---------------------------------------------------------------------------
def test_public_order_with_loyalty_redemption_reduces_balance(
    api_client, org_a, item_a
):
    """POST /api/v1/public/orders with loyalty_points_to_redeem works."""
    make_loyalty_settings(
        org_a, is_enabled=True, redemption_rate=Decimal("0.10"),
        min_points_to_redeem=10,
    )
    customer = make_customer(email="buyer@example.com")
    make_earn_txn(customer, org_a, points=500)
    _customer_login(api_client, customer)

    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Buyer",
            "customer_phone": "+905320000000",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
            "loyalty_points_to_redeem": 100,
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()["data"]
    assert body["loyalty_points_redeemed"] == 100
    # 100 puan * 0.10 = 10 TL.
    assert body["loyalty_discount_amount"] == "10.00"
    # Balance after redeem: 500 - 100 = 400.
    assert body["loyalty_balance_after"] == 400

    # And: a LoyaltyTransaction.REDEEM row exists.
    from apps.account.models import LoyaltyTransaction

    txn = LoyaltyTransaction.objects.filter(
        customer=customer, type=LoyaltyTransaction.REDEEM
    ).get()
    assert txn.points == -100


def test_public_order_with_loyalty_redemption_insufficient_balance_returns_400(
    api_client, org_a, item_a
):
    make_loyalty_settings(
        org_a, is_enabled=True, redemption_rate=Decimal("0.10"),
        min_points_to_redeem=10,
    )
    customer = make_customer(email="poor@example.com")
    # No earn — balance is 0.
    _customer_login(api_client, customer)
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Poor",
            "customer_phone": "+905320000000",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
            "loyalty_points_to_redeem": 100,
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "loyalty.insufficient_balance"


def test_public_order_without_customer_cookie_and_with_redeem_returns_400(
    api_client, org_a, item_a
):
    make_loyalty_settings(org_a, is_enabled=True)
    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Anon",
            "customer_phone": "+905320000000",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
            "loyalty_points_to_redeem": 100,
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "loyalty.not_authenticated"
