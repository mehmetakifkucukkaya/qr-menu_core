"""Services tests (D-026 — Sprint 11A).

10 tests:
1. create_payment_for_order_creates_payment_record
2. create_payment_for_order_uses_payment_settings_provider
3. create_payment_for_order_raises_when_payment_settings_missing
4. handle_webhook_event_idempotent (same event_id twice → no-op)
5. handle_webhook_event_payment_intent_succeeded_updates_order
6. handle_webhook_event_already_paid_no_op
7. handle_webhook_event_refund_triggers_loyalty_reverse
8. refund_payment_creates_refund_record
9. refund_payment_records_full_amount
10. reconcile_pending_payments_finds_orphan_intents
"""

from __future__ import annotations

import json
from decimal import Decimal

import pytest

from apps.payment.models import OrderPayment, RefundRecord
from apps.payment.services import (
    create_payment_for_order,
    handle_webhook_event,
    reconcile_pending_payments,
    refund_payment,
)


pytestmark = pytest.mark.django_db


def test_create_payment_for_order_creates_payment_record(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)
    payment = create_payment_for_order(order=order)
    assert payment.provider_payment_id == "pi_test_3Oxxxxxxxxxxxxxx"
    assert payment.amount == Decimal("100.00")
    assert payment.currency == "TRY"


def test_create_payment_for_order_requires_settings(
    organization_a, make_order
):
    """No settings row → services raise a domain error."""
    order = make_order(organization_a)
    from django.core.exceptions import ValidationError
    with pytest.raises(ValidationError):
        create_payment_for_order(order=order)


def test_create_payment_for_order_records_metadata(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    make_payment_settings(organization_a)
    order = make_order(organization_a, order_number="CA-20260928-009")
    payment = create_payment_for_order(order=order)
    assert payment.raw_response["metadata"]["order_number"] == "CA-20260928-009"


def test_handle_webhook_event_idempotent(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    """A duplicate ``evt_xxx`` returns the cached row, never double-processes."""
    from apps.payment.providers import WebhookEvent as PWH  # re-export from base
    from apps.payment.models import WebhookEvent

    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    payload = json.dumps(
        {
            "id": "evt_dup_001",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": "pi_test_3Oxxxxxxxxxxxxxx",
                    "amount_received": 10000,
                }
            },
        }
    ).encode("utf-8")
    first = handle_webhook_event(
        provider_name="stripe", payload=payload, signature_header="t=1,v1=a"
    )
    second = handle_webhook_event(
        provider_name="stripe", payload=payload, signature_header="t=1,v1=a"
    )
    # Second call returns the cached row (processed=True on first run).
    assert first.provider_event_id == second.provider_event_id == "evt_dup_001"
    assert WebhookEvent.objects.filter(provider_event_id="evt_dup_001").count() == 1


def test_handle_webhook_event_payment_intent_succeeded_updates_order(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    from apps.orders.models import OrderStatus
    from apps.payment.models import OrderPayment

    make_payment_settings(organization_a)
    order = make_order(organization_a)
    payment = create_payment_for_order(order=order)
    assert order.status == OrderStatus.PENDING

    payload = json.dumps(
        {
            "id": "evt_paid_001",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": payment.provider_payment_id,
                    "amount_received": 10000,
                }
            },
        }
    ).encode("utf-8")

    handle_webhook_event(
        provider_name="stripe", payload=payload, signature_header="t=1,v1=a"
    )

    order.refresh_from_db()
    payment.refresh_from_db()
    assert payment.provider_payment_status == "succeeded"
    assert payment.amount == Decimal("100.00")
    assert order.status == OrderStatus.CONFIRMED


def test_handle_webhook_event_already_paid_no_op(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    """If order is already confirmed, the webhook is a no-op."""
    from apps.orders.services import transition_status
    from apps.orders.models import OrderStatus
    from apps.payment.models import OrderPayment

    make_payment_settings(organization_a)
    order = make_order(organization_a)
    payment = create_payment_for_order(order=order)
    transition_status(order, OrderStatus.CONFIRMED, actor=None)

    payload = json.dumps(
        {
            "id": "evt_already",
            "type": "payment_intent.succeeded",
            "data": {
                "object": {
                    "id": payment.provider_payment_id,
                    "amount_received": 10000,
                }
            },
        }
    ).encode("utf-8")

    handle_webhook_event(
        provider_name="stripe", payload=payload, signature_header="t=1,v1=a"
    )
    # Nothing crashes, audit events stay the same.
    order.refresh_from_db()
    assert order.status == OrderStatus.CONFIRMED


def test_refund_payment_creates_refund_record(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order, user_a
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    refund = refund_payment(
        order=order,
        amount=None,  # full
        reason="customer_request",
        initiated_by_user=user_a,
    )
    assert refund.provider_refund_id == "re_test_3Oxxxxxxxxxxxxxx"
    assert refund.status == "succeeded"
    assert RefundRecord.objects.filter(provider_refund_id="re_test_3Oxxxxxxxxxxxxxx").exists()


def test_refund_payment_triggers_loyalty_reverse_when_earn_exists(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order,
    user_a, customer_a,
):
    """D-025 integration: refunding a delivered order that earned points
    must create a matching ``type='reverse'`` LoyaltyTransaction."""
    from apps.account.models import LoyaltyTransaction
    from apps.orders.models import OrderStatus
    from apps.orders.services import transition_status

    make_payment_settings(organization_a)
    order = make_order(organization_a, customer=customer_a)
    create_payment_for_order(order=order)

    # Simulate delivered + earn (loyalty award hook fires here in real flow).
    LoyaltyTransaction.objects.create(
        customer=customer_a,
        organization=organization_a,
        type="earn",
        points=100,
        order=order,
        note="Initial earn",
    )
    # Walk the real state machine - pending -> delivered is not a legal jump,
    # which is why this test could never have reached the refund call.
    for step in (
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.READY,
        OrderStatus.DELIVERED,
    ):
        transition_status(order, step, actor=user_a)

    refund_payment(
        order=order, amount=None, reason="customer_request", initiated_by_user=user_a,
    )

    reverses = LoyaltyTransaction.objects.filter(order=order, type="reverse")
    assert reverses.count() == 1
    assert reverses.first().points == -100


def test_refund_payment_requires_payment_record(
    make_payment_settings, organization_a, make_order
):
    """Refund on an order without a payment record raises a domain error."""
    from apps.payment.errors import PaymentSettingMissing

    order = make_order(organization_a)
    with pytest.raises(PaymentSettingMissing):
        refund_payment(order=order, amount=None, reason="customer_request", initiated_by_user=None)


def test_reconcile_pending_payments_finds_orphan_intents(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    """Reconcile scans pending intents and confirms the ones the SDK
    reports as succeeded."""
    from apps.orders.models import OrderStatus

    make_payment_settings(organization_a)
    order = make_order(organization_a)
    payment = create_payment_for_order(order=order)
    # Leave the order on ``pending`` to simulate a missed webhook.

    result = reconcile_pending_payments(organization=organization_a)
    assert result["scanned"] >= 1

    order.refresh_from_db()
    assert order.status == OrderStatus.CONFIRMED


def test_handle_webhook_event_signature_missing_raises(make_payment_settings, organization_a):
    """If the signature header is missing/invalid, view returns 401.
    At the service level this is exposed as PaymentInvalidSignature.
    """
    make_payment_settings(organization_a)
    from apps.payment.errors import PaymentInvalidSignature

    # Force an invalid signature by stubbing out the verify step.
    from unittest.mock import patch

    with patch("apps.payment.providers.stripe.stripe.Webhook.construct_event") as m:
        from stripe.error import SignatureVerificationError

        m.side_effect = SignatureVerificationError("bad", "x")
        # Exactly PaymentInvalidSignature - ``(PSIE, Exception)`` accepted any
        # error at all, including the TypeErrors this suite was hiding.
        with pytest.raises(PaymentInvalidSignature):
            handle_webhook_event(
                provider_name="stripe",
                payload=b"{}",
                signature_header="bad",
            )
