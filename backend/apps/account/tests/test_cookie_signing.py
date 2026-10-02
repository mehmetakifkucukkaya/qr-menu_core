"""Customer session cookie must be tamper-proof — ANALYSIS_1 F-07.

Before the fix the cookie value was the bare ``customer.pk``. Anyone could
send ``Cookie: _auth_customer_id=<pk>`` (primary keys are sequential) and
read or edit that customer's profile, order history and loyalty balance,
or spend their points at checkout. The existing tests even treated a raw
pk cookie as "logged in", so nothing noticed.

The cookie is now a Django signed + timestamped value. These tests pin the
properties that matter: a raw pk is not a session, a tampered or re-salted
value is not a session, an expired value is not a session, and a genuine
magic-link login still works end to end.
"""

from __future__ import annotations

import time
from unittest import mock

import pytest
from django.conf import settings
from django.core import signing
from rest_framework.test import APIClient

from apps.account.models import Customer, LoyaltyTransaction, MagicLinkToken
from apps.account.tests.factories import (
    make_customer,
    make_earn_txn,
    make_loyalty_settings,
)

pytestmark = pytest.mark.django_db


def _magic_link_login(client: APIClient, customer: Customer) -> str:
    """Log in through the real verify endpoint; return the cookie value."""
    token = MagicLinkToken.generate(customer=customer, ttl_minutes=15)
    response = client.get(f"/api/v1/account/auth/verify?token={token.token}")
    assert response.status_code == 200
    return response.cookies[settings.AUTH_COOKIE_NAME].value


def _denied(response) -> bool:
    return response.status_code in {401, 403}


# ---------------------------------------------------------------------------
# The vulnerability: a bare pk must never be accepted
# ---------------------------------------------------------------------------
def test_raw_pk_cookie_cannot_read_the_profile(api_client):
    victim = make_customer(email="victim@example.com", full_name="Victim")
    api_client.cookies[settings.AUTH_COOKIE_NAME] = str(victim.pk)

    assert _denied(api_client.get("/api/v1/account/me"))
    assert _denied(api_client.get("/api/v1/account/me/orders"))
    assert _denied(api_client.get("/api/v1/account/me/loyalty"))


def test_raw_pk_cookie_cannot_edit_the_profile(api_client):
    victim = make_customer(email="victim@example.com", full_name="Victim")
    api_client.cookies[settings.AUTH_COOKIE_NAME] = str(victim.pk)

    response = api_client.patch(
        "/api/v1/account/me", data={"full_name": "pwned"}, format="json"
    )

    assert _denied(response)
    victim.refresh_from_db()
    assert victim.full_name == "Victim"


def test_raw_pk_cookie_cannot_spend_loyalty_points_at_checkout(
    api_client, org_a, item_a
):
    make_loyalty_settings(org_a, is_enabled=True, min_points_to_redeem=1)
    victim = make_customer(email="victim@example.com")
    make_earn_txn(victim, org_a, points=500)
    api_client.cookies[settings.AUTH_COOKIE_NAME] = str(victim.pk)

    response = api_client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": org_a.slug,
            "customer_name": "Attacker",
            "customer_phone": "+905320000000",
            "items": [{"menu_item_id": item_a.id, "quantity": 1}],
            "loyalty_points_to_redeem": 400,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "loyalty.not_authenticated"
    assert not LoyaltyTransaction.objects.filter(
        customer=victim, type=LoyaltyTransaction.REDEEM
    ).exists()


# ---------------------------------------------------------------------------
# A forged / foreign / stale signed value is not a session either
# ---------------------------------------------------------------------------
def test_swapping_the_customer_id_inside_a_signed_cookie_is_rejected(api_client):
    attacker = make_customer(email="attacker@example.com")
    victim = make_customer(email="victim@example.com")
    genuine = _magic_link_login(api_client, attacker)
    _pk, timestamp, signature = genuine.split(":", 2)

    forged = f"{victim.pk}:{timestamp}:{signature}"
    api_client.cookies[settings.AUTH_COOKIE_NAME] = forged

    assert _denied(api_client.get("/api/v1/account/me"))


def test_value_signed_for_another_purpose_is_rejected(api_client):
    """A signature made without our salt (e.g. another signed cookie) fails."""
    victim = make_customer(email="victim@example.com")
    foreign = signing.get_cookie_signer(salt=settings.AUTH_COOKIE_NAME).sign(
        str(victim.pk)
    )
    api_client.cookies[settings.AUTH_COOKIE_NAME] = foreign

    assert _denied(api_client.get("/api/v1/account/me"))


def test_cookie_expires_on_the_server_not_only_in_the_browser(api_client):
    customer = make_customer(email="old@example.com")
    _magic_link_login(api_client, customer)  # sets the cookie on the client
    assert api_client.get("/api/v1/account/me").status_code == 200

    max_age = int(settings.MAGIC_LINK_TTL_MINUTES) * 60 * 4
    with mock.patch(
        "django.core.signing.time.time", return_value=time.time() + max_age + 5
    ):
        assert _denied(api_client.get("/api/v1/account/me"))


def test_deactivated_customer_loses_the_session(api_client):
    customer = make_customer(email="gone@example.com")
    _magic_link_login(api_client, customer)
    assert api_client.get("/api/v1/account/me").status_code == 200

    Customer.objects.filter(pk=customer.pk).update(is_active=False)

    assert _denied(api_client.get("/api/v1/account/me"))


# ---------------------------------------------------------------------------
# The legitimate flow still works
# ---------------------------------------------------------------------------
def test_magic_link_login_issues_a_signed_cookie_that_opens_the_session(api_client):
    customer = make_customer(email="real@example.com", full_name="Real")

    value = _magic_link_login(api_client, customer)

    assert value != str(customer.pk), "cookie must not be the bare pk"
    assert value.startswith(f"{customer.pk}:"), "pk is signed, not hidden"
    response = api_client.get("/api/v1/account/me")
    assert response.status_code == 200
    assert response.json()["data"]["email"] == "real@example.com"


def test_session_cookie_is_httponly_lax_and_follows_the_secure_setting(
    api_client, settings
):
    settings.AUTH_COOKIE_SECURE = True
    customer = make_customer(email="flags@example.com")
    token = MagicLinkToken.generate(customer=customer, ttl_minutes=15)

    response = api_client.get(f"/api/v1/account/auth/verify?token={token.token}")

    morsel = response.cookies[settings.AUTH_COOKIE_NAME]
    assert morsel["httponly"]
    assert morsel["samesite"] == "Lax"
    assert morsel["secure"]
