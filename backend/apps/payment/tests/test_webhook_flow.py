"""Webhook and money-movement flows with REAL signatures — ANALYSIS_1 F-06.

These are the paths that threw TypeError on every call and were therefore
dead on arrival (each Stripe delivery -> HTTP 500, a paid order stayed
``pending``, a refund left Stripe but failed in our API). They run against the
real ``stripe.Webhook.construct_event`` with an HMAC computed by the test.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.orders.models import OrderStatus
from apps.payment import services
from apps.payment.models import OrderPayment, RefundRecord, WebhookEvent
from apps.payment.services import create_payment_for_order
from apps.payment.tests.conftest import WEBHOOK_SECRET, stripe_event, stripe_signature

pytestmark = pytest.mark.django_db

URL = "/api/v1/payment/webhooks/stripe/"


@pytest.fixture
def paid_setup(mock_stripe_api, make_payment_settings, organization_a, make_order):
    """An org with Stripe configured and a pending order that has an intent."""
    make_payment_settings(organization_a, webhook_secret=WEBHOOK_SECRET)
    order = make_order(organization_a)
    payment = create_payment_for_order(order=order)
    return order, payment


def _deliver(payment, event_id="evt_paid_001", *, client=None, secret=WEBHOOK_SECRET):
    body = stripe_event(
        event_id,
        "payment_intent.succeeded",
        id=payment.provider_payment_id,
        amount_received=10000,
    )
    client = client or APIClient()
    return client.post(
        URL,
        data=body,
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE=stripe_signature(body, secret),
    )


# --- root cause 1: URL kwarg vs view signature -------------------------------


def test_signed_webhook_reaches_the_handler_instead_of_a_typeerror(paid_setup):
    _order, payment = paid_setup
    res = _deliver(payment)
    assert res.status_code == 200, res.content
    assert res.json()["processed"] is True


# --- root causes 2+3: transition_status(payload=) and record_event(actor=) ---


def test_paid_order_is_confirmed_and_audited(paid_setup, organization_a):
    order, payment = paid_setup
    assert order.status == OrderStatus.PENDING

    assert _deliver(payment).status_code == 200

    order.refresh_from_db()
    payment.refresh_from_db()
    assert order.status == OrderStatus.CONFIRMED
    assert order.confirmed_at is not None
    assert payment.provider_payment_status == "succeeded"
    assert payment.paid_at is not None
    actions = set(
        AuditEvent.objects.filter(organization=organization_a).values_list("action", flat=True)
    )
    assert {"order_confirmed", "order_paid"} <= actions
    paid = AuditEvent.objects.get(organization=organization_a, action="order_paid")
    assert paid.payload["via"] == "payment_webhook"
    assert paid.target_repr  # record_event requires it


def test_redelivery_of_a_processed_event_changes_nothing(paid_setup, organization_a):
    order, payment = paid_setup
    assert _deliver(payment, "evt_dup").status_code == 200
    assert _deliver(payment, "evt_dup").status_code == 200

    assert WebhookEvent.objects.filter(provider_event_id="evt_dup").count() == 1
    assert AuditEvent.objects.filter(organization=organization_a, action="order_paid").count() == 1


def test_a_failed_dispatch_is_retried_on_redelivery(paid_setup, monkeypatch):
    """Stripe retries after a 5xx. The first attempt used to leave a WebhookEvent
    row behind, so the retry was treated as a duplicate and skipped: the customer
    stayed charged and the order stayed pending, forever."""
    order, payment = paid_setup
    real = services._confirm_order_after_payment
    calls = {"n": 0}

    def flaky(p):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("database hiccup")
        return real(p)

    monkeypatch.setattr(services, "_confirm_order_after_payment", flaky)
    client = APIClient(raise_request_exception=False)

    first = _deliver(payment, "evt_retry", client=client)
    assert first.status_code == 500
    order.refresh_from_db()
    assert order.status == OrderStatus.PENDING
    row = WebhookEvent.objects.get(provider_event_id="evt_retry")
    assert row.processed is False and "database hiccup" in row.error

    second = _deliver(payment, "evt_retry", client=client)
    assert second.status_code == 200
    order.refresh_from_db()
    assert order.status == OrderStatus.CONFIRMED
    row.refresh_from_db()
    assert row.processed is True and row.error == ""
    assert WebhookEvent.objects.filter(provider_event_id="evt_retry").count() == 1


# --- the webhook route itself -------------------------------------------------


def test_unknown_provider_in_the_url_is_a_404(paid_setup):
    res = APIClient().post(
        "/api/v1/payment/webhooks/paypal/", data=b"{}", content_type="application/json"
    )
    assert res.status_code == 404


def test_repeated_webhooks_with_no_settings_never_500(db):
    """No tenant has Stripe configured: each delivery used to insert the same
    ('stripe', 'no_settings') placeholder row -> IntegrityError on the second."""
    client = APIClient(raise_request_exception=False)
    for _ in range(3):
        res = client.post(URL, data=b"{}", content_type="application/json")
        assert res.status_code == 200, res.content


# --- root cause 4: IyzicoProvider constructor ---------------------------------


def test_iyzico_tenant_gets_a_clean_502_not_a_server_error(
    mock_stripe_api, make_payment_settings, organization_a, make_order
):
    make_payment_settings(organization_a, provider_name="iyzico")
    order = make_order(organization_a)

    res = APIClient().post(
        f"/api/v1/payment/public/orders/{order.order_number}/pay/", data={}, format="json"
    )

    assert res.status_code == 502
    assert res.json()["code"] == "payment.provider_unavailable"


def test_iyzico_refund_is_a_502_not_a_500(
    make_payment_settings, organization_a, make_order, user_a
):
    make_payment_settings(organization_a, provider_name="iyzico")
    order = make_order(organization_a)
    OrderPayment.objects.create(
        order=order,
        organization=organization_a,
        provider_name="iyzico",
        provider_payment_id="iyz_1",
        provider_payment_status="succeeded",
        amount=order.total_amount,
        currency="TRY",
    )
    client = APIClient()
    client.force_authenticate(user=user_a)

    res = client.post(
        "/api/v1/payment/admin/payment/refunds/",
        data={"order_number": order.order_number, "amount": "10.00", "reason": "customer_request"},
        format="json",
    )

    assert res.status_code == 502
    assert res.json()["code"] == "payment.provider_unavailable"


# --- refunds and reconciliation write audit rows with the real signature -----


def test_refund_is_recorded_and_audited(paid_setup, organization_a, user_a):
    order, _payment = paid_setup
    client = APIClient()
    client.force_authenticate(user=user_a)

    res = client.post(
        "/api/v1/payment/admin/payment/refunds/",
        data={"order_number": order.order_number, "amount": "50.00", "reason": "customer_request"},
        format="json",
    )

    assert res.status_code == 201, res.content
    assert RefundRecord.objects.filter(order=order).count() == 1
    event = AuditEvent.objects.get(organization=organization_a, action="order_refunded")
    assert event.target_repr and event.payload["order_number"] == order.order_number


def test_reconcile_confirms_the_order_and_audits_the_run(paid_setup, organization_a, user_a):
    order, _payment = paid_setup  # missed webhook: still pending, Stripe says paid
    client = APIClient()
    client.force_authenticate(user=user_a)

    res = client.post("/api/v1/payment/admin/payment/reconcile/")

    assert res.status_code == 200, res.content
    assert res.json()["reconciled"] == 1
    order.refresh_from_db()
    assert order.status == OrderStatus.CONFIRMED
    run = AuditEvent.objects.get(organization=organization_a, action="payment_reconciled")
    assert run.target_repr and run.payload["reconciled"] == 1
