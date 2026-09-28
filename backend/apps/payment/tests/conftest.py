"""Test fixtures for the payment app.

Reuses project-wide conftest fixtures (``org_a``, ``org_b``, ``admin_user``,
``api_client``) and adds payment-specific factories + tenant helpers.

Note: ``user_a`` / ``user_b`` are NOT provided by the root conftest —
they come from the ``apps.account.tests.conftest`` fixtures (which we
re-import here so a single ``pytest.ini`` run from ``backend/`` sees
both).
"""

from __future__ import annotations

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """DRF anon-throttle cache can leak between tests — clear it."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _reset_audit_context():
    """Clear the audit thread-local between tests (matches orders/translate pattern)."""
    from apps.audit.context import _local, clear

    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")
    yield
    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")


# Map the root conftest's ``org_a`` etc. to the names our tests use,
# so worker-written tests that say ``organization_a`` resolve to the
# right project fixture without a typo.
@pytest.fixture
def organization_a(org_a):
    return org_a


@pytest.fixture
def organization_b(org_b):
    return org_b


@pytest.fixture
def user_a(org_a):
    """Owner of org_a — alias of the auth_user_a fixture from apps.account."""
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="owner-a@example.com")


@pytest.fixture
def user_b(org_b):
    """Owner of org_b."""
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="owner-b@example.com")


@pytest.fixture
def customer_a(org_a):
    """Müşteri hesabı (D-025)."""
    from apps.account.models import Customer

    return Customer.objects.create(
        email="alice@example.com", full_name="Alice", phone="+905320000001"
    )


@pytest.fixture
def make_payment_settings(db):
    """Factory: create PaymentSettings for an org with the given kwargs.

    Saves both ``api_key`` + ``webhook_secret`` as raw plaintext via
    ``set_api_key`` + ``set_webhook_secret`` (which Fernet-encrypt under
    the hood).
    """

    def _make(org, **kwargs):
        from apps.payment.models import PaymentSettings

        api_key_raw = kwargs.pop("api_key", "sk_test_dummy_abcdef0123456789")
        webhook_secret_raw = kwargs.pop("webhook_secret", "whsec_dummy_abcdef0123456789")

        defaults = {
            "provider_name": "stripe",
            "is_test_mode": True,
            "is_enabled": True,
        }
        defaults.update(kwargs)

        settings_obj, _ = PaymentSettings.objects.get_or_create(
            organization=org,
            defaults={"provider_name": defaults["provider_name"]},
        )
        for k, v in defaults.items():
            setattr(settings_obj, k, v)
        settings_obj.set_api_key(api_key_raw)
        settings_obj.set_webhook_secret(webhook_secret_raw)
        settings_obj.save()
        return settings_obj

    return _make


@pytest.fixture
def make_order(db):
    """Factory: minimal Order usable by the payment services."""

    def _make(org, **kwargs):
        from apps.orders.models import Order, OrderStatus
        from decimal import Decimal

        defaults = {
            "order_number": "TEST-20260928-001",
            "status": OrderStatus.PENDING,
            "total_amount": Decimal("100.00"),
            "currency": "TRY",
            "customer_name": "Test Customer",
            "customer_phone": "+905320000000",
        }
        defaults.update(kwargs)
        return Order.objects.create(organization=org, **defaults)

    return _make


@pytest.fixture
def mock_stripe_payment_intent(monkeypatch):
    """Patch the SDK calls invoked by ``StripeProvider`` — pure
    ``monkeypatch`` style, never hits the network."""

    class _FakeIntent:
        id = "pi_test_3Oxxxxxxxxxxxxxx"
        client_secret = "pi_test_3Oxxxxxxxxxxxxxx_secret_abcdef"
        amount = 10000
        amount_received = 10000
        currency = "try"
        status = "requires_payment_method"
        metadata = {}

        def to_dict(self):
            return {
                "id": self.id,
                "amount": self.amount,
                "amount_received": self.amount_received,
                "currency": self.currency,
                "status": self.status,
                "metadata": self.metadata,
            }

    def fake_create(*args, **kwargs):
        intent = _FakeIntent()
        intent.metadata = kwargs.get("metadata", {})
        return intent

    def fake_retrieve(payment_id, *args, **kwargs):
        intent = _FakeIntent()
        intent.status = "succeeded"
        intent.amount_received = 10000
        return intent

    def fake_refund(**kwargs):
        class _FakeRefund:
            id = "re_test_3Oxxxxxxxxxxxxxx"
            amount = kwargs.get("amount", 10000)
            currency = "try"
            status = "succeeded"
            reason = kwargs.get("reason", "admin_action")
            created = 1695900000

        return _FakeRefund()

    def fake_construct_event(payload, signature, secret):
        import json

        decoded = json.loads(payload.decode("utf-8")) if payload else {}
        event = _FakeIntent()
        event.id = decoded.get("id", "evt_fake_001")
        event.type = decoded.get("type", "payment_intent.succeeded")
        return event

    import stripe

    monkeypatch.setattr(stripe.PaymentIntent, "create", fake_create)
    monkeypatch.setattr(stripe.PaymentIntent, "retrieve", fake_retrieve)
    monkeypatch.setattr(stripe.Refund, "create", fake_refund)
    monkeypatch.setattr(stripe.Webhook, "construct_event", fake_construct_event)
    return _FakeIntent
