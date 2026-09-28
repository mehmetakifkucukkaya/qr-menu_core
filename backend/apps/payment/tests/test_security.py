"""Security tests (D-026 — Sprint 11A).

10 tests: webhook CSRF, signature verify, cross-tenant 404, encrypted at
rest, audit event org-scoped, etc.
"""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.payment.crypto import decrypt, encrypt


pytestmark = pytest.mark.django_db


def test_webhook_endpoint_csrf_exempt(client):
    """Webhook must be reachable without a CSRF token (signature is the auth)."""
    res = client.post(
        "/api/v1/payment/webhooks/stripe/",
        data=b"{}",
        content_type="application/json",
    )
    # Either 200 (no settings) or some other non-403 — never a CSRF reject.
    assert res.status_code != 403


def test_webhook_invalid_signature_returns_401(
    mock_stripe_payment_intent, make_payment_settings, organization_a
):
    make_payment_settings(organization_a, webhook_secret="whsec_real_xyz")
    client = APIClient()
    res = client.post(
        "/api/v1/payment/webhooks/stripe/",
        data=b'{"id":"evt_x","type":"payment_intent.succeeded","data":{"object":{"id":"pi_x","amount_received":100}}}',
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE="bad-sig",
    )
    assert res.status_code == 401


def test_fernet_encryption_roundtrip():
    """Round-trip plaintext → ciphertext → plaintext works."""
    plaintext = "sk_test_dummy_xyz"
    ciphertext = encrypt(plaintext)
    assert ciphertext != plaintext
    assert decrypt(ciphertext) == plaintext


def test_fernet_decryption_fails_for_wrong_key():
    from cryptography.fernet import Fernet

    c1 = encrypt("hello")
    # Now rotate the key — old ciphertext is invalid.
    other_key = Fernet.generate_key()
    import importlib
    from apps.payment import crypto

    importlib.reload(crypto)
    crypto._get_fernet.cache_clear()
    original = crypto._get_fernet

    def fake_fernet():
        return Fernet(other_key)

    crypto._get_fernet = fake_fernet
    try:
        with pytest.raises(crypto.PaymentCryptoError):
            crypto.decrypt(c1)
    finally:
        crypto._get_fernet = original
        crypto._get_fernet.cache_clear()


def test_api_key_encrypted_at_rest(
    make_payment_settings, organization_a
):
    """The DB column stores ciphertext — never plaintext."""
    settings_obj = make_payment_settings(
        organization_a, api_key="sk_test_plain_super_secret"
    )
    assert settings_obj.api_key == "sk_test_plain_super_secret"
    assert "plain_super_secret" not in settings_obj.api_key_encrypted


def test_api_key_not_in_admin_response(
    make_payment_settings, organization_a, user_a
):
    """The masked field is ``api_key_masked`` — ``api_key`` is write-only."""
    make_payment_settings(organization_a)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.get("/api/v1/payment/admin/payment/settings/")
    assert res.status_code == 200
    body = res.json()
    assert "api_key" not in body
    assert "api_key_masked" in body


def test_cross_tenant_admin_refund_returns_404(
    mock_stripe_payment_intent, make_payment_settings, organization_a, organization_b,
    make_order, user_a, user_b
):
    """User_a in org_a cannot refund a payment from org_b's order."""
    make_payment_settings(organization_a)
    make_payment_settings(organization_b)

    # Create the order in org_b.
    order = make_order(
        organization_b, order_number="OB-20260928-001"
    )
    # Create the payment in org_b too.
    from apps.payment.services import create_payment_for_order

    create_payment_for_order(order=order)

    # User_a (org_a) tries to refund — org_b cross-tenant 404.
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.post(
        "/api/v1/payment/admin/payment/refunds/",
        data={
            "order_number": order.order_number,
            "amount": "10.00",
            "reason": "customer_request",
        },
        format="json",
    )
    assert res.status_code == 404


def test_admin_refund_requires_org_member(organization_a, user_b):
    """User_b without membership cannot access admin endpoints."""
    client = APIClient()
    client.force_authenticate(user=user_b)
    res = client.get("/api/v1/payment/admin/payment/settings/")
    assert res.status_code == 403


def test_webhook_idempotent_duplicate_no_double_processing(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    from apps.payment.models import WebhookEvent
    from apps.payment.services import handle_webhook_event

    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    payload = json.dumps(
        {
            "id": "evt_double_001",
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": "pi_test_3Oxxxxxxxxxxxxxx", "amount_received": 10000}},
        }
    ).encode("utf-8")

    handle_webhook_event(provider_name="stripe", payload=payload, signature_header="x")
    handle_webhook_event(provider_name="stripe", payload=payload, signature_header="x")
    handle_webhook_event(provider_name="stripe", payload=payload, signature_header="x")
    assert WebhookEvent.objects.filter(provider_event_id="evt_double_001").count() == 1


def test_settings_endpoint_unauthenticated_returns_401(organization_a):
    client = APIClient()
    res = client.get("/api/v1/payment/admin/payment/settings/")
    assert res.status_code == 401
