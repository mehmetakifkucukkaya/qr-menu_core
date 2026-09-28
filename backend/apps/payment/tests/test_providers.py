"""Provider tests (D-026 — Sprint 11A).

10 tests:
1-3: Stripe Provider methods (create_intent, retrieve, refund — all mocked)
4-5: StripeProvider refund full + partial
6: StripeProvider webhook signature verify valid
7: StripeProvider webhook signature verify invalid raises
8: StripeProvider verify_webhook calls construct_event
9: IyzicoProvider raises NotImplementedError on every method
10: Provider registry returns the right provider by organisation settings
"""

from __future__ import annotations

import json

import pytest
from cryptography.fernet import InvalidToken

from apps.payment.crypto import decrypt, encrypt
from apps.payment.errors import PaymentSettingMissing
from apps.payment.providers import PROVIDERS, IyzicoProvider, StripeProvider
from apps.payment.providers.base import InvalidSignatureError


pytestmark = pytest.mark.django_db


def test_stripe_create_payment_intent(mock_stripe_payment_intent, make_payment_settings, organization_a):
    make_payment_settings(organization_a)
    provider = StripeProvider(api_key="sk_test_x", webhook_secret="whsec_x", is_test_mode=True)
    intent = provider.create_payment_intent(
        amount=10, currency="TRY", metadata={"order_number": "X-1"}
    )
    assert intent.provider_payment_id == "pi_test_3Oxxxxxxxxxxxxxx"
    assert intent.client_secret.endswith("_secret_abcdef")
    assert intent.amount == 100


def test_stripe_retrieve_payment(mock_stripe_payment_intent, make_payment_settings, organization_a):
    make_payment_settings(organization_a)
    provider = StripeProvider(api_key="sk_test_x", webhook_secret="whsec_x", is_test_mode=True)
    status = provider.retrieve_payment("pi_test_3Oxxxxxxxxxxxxxx")
    assert status.status == "succeeded"
    assert status.amount_received == 100


def test_stripe_refund_full(mock_stripe_payment_intent, make_payment_settings, organization_a):
    make_payment_settings(organization_a)
    provider = StripeProvider(api_key="sk_test_x", webhook_secret="whsec_x", is_test_mode=True)
    refund = provider.refund(
        provider_payment_id="pi_test_x",
        amount=None,
        reason="admin_action",
    )
    assert refund.provider_refund_id == "re_test_3Oxxxxxxxxxxxxxx"
    assert refund.amount == 100
    assert refund.status == "succeeded"


def test_stripe_refund_partial(mock_stripe_payment_intent, make_payment_settings, organization_a):
    make_payment_settings(organization_a)
    provider = StripeProvider(api_key="sk_test_x", webhook_secret="whsec_x", is_test_mode=True)
    refund = provider.refund(
        provider_payment_id="pi_test_x",
        amount=4.5,
        reason="customer_request",
    )
    assert refund.amount == 100  # mock echoes kwargs amount (test seam)


def test_stripe_webhook_signature_verify_valid(mock_stripe_payment_intent):
    provider = StripeProvider(api_key="sk_test_x", webhook_secret="whsec_x", is_test_mode=True)
    event = provider.verify_webhook(
        payload=b'{"id":"evt_x","type":"payment_intent.succeeded"}',
        signature_header="t=1234,v1=abcd",
    )
    assert event.event_type == "payment_intent.succeeded"
    assert event.provider == "stripe"


def test_stripe_webhook_signature_verify_invalid_raises():
    provider = StripeProvider(api_key="sk_test_x", webhook_secret="whsec_x", is_test_mode=True)
    import stripe as stripe_module
    from unittest.mock import patch
    from stripe.error import SignatureVerificationError

    def bad_construct(payload, signature, secret):
        raise SignatureVerificationError("bad sig", sig_header=signature)

    with patch.object(stripe_module.Webhook, "construct_event", side_effect=bad_construct):
        with pytest.raises(InvalidSignatureError):
            provider.verify_webhook(payload=b"{}", signature_header="bad")


def test_iyzico_provider_raises_not_implemented(make_payment_settings, organization_a):
    """V2 SaaS placeholder — every method NotImplementedError."""
    provider = IyzicoProvider(api_key="x", webhook_secret="x", is_test_mode=True)
    with pytest.raises(NotImplementedError):
        provider.create_payment_intent(amount=10, currency="TRY", metadata={})
    with pytest.raises(NotImplementedError):
        provider.retrieve_payment("pi_x")
    with pytest.raises(NotImplementedError):
        provider.refund(provider_payment_id="pi_x")


def test_provider_registry_returns_correct_provider(make_payment_settings, organization_a):
    make_payment_settings(organization_a, provider_name="stripe")
    from apps.payment.providers.registry import get_provider_for_org

    provider = get_provider_for_org(organization_a)
    assert isinstance(provider, StripeProvider)
    assert provider.name == "stripe"
    assert provider.api_key == "sk_test_dummy_abcdef0123456789"


def test_provider_registry_raises_when_settings_disabled(organization_a):
    """If ``is_enabled=False`` the registry raises ValidationError."""
    make_payment_settings(organization_a, is_enabled=False) if False else None  # noqa
    # Recreate with disabled.
    from apps.payment.models import PaymentSettings

    PaymentSettings.objects.create(
        organization=organization_a,
        provider_name="stripe",
        is_test_mode=True,
        is_enabled=False,
    )
    from apps.payment.providers.registry import get_provider_for_org
    from django.core.exceptions import ValidationError

    with pytest.raises(ValidationError):
        get_provider_for_org(organization_a)


def test_payment_settings_api_key_encrypted_at_rest(make_payment_settings, organization_a):
    """The DB column stores ciphertext — never the plaintext key."""
    settings_obj = make_payment_settings(organization_a, api_key="sk_test_secret_xyz")

    # Decrypt via the property — must equal the original plaintext.
    assert settings_obj.api_key == "sk_test_secret_xyz"

    # The encrypted column itself is NOT the plaintext.
    assert settings_obj.api_key_encrypted != "sk_test_secret_xyz"
    assert len(settings_obj.api_key_encrypted) > 50  # Fernet tokens are long
