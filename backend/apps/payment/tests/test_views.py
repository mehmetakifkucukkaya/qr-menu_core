"""View tests (D-026 — Sprint 11A).

10 tests: 11 endpoint happy + 401 + 400 + 404 paths.
"""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.payment.models import OrderPayment, RefundRecord
from apps.payment.services import create_payment_for_order


pytestmark = pytest.mark.django_db


def test_public_create_payment_intent(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)

    client = APIClient()
    res = client.post(
        f"/api/v1/payment/public/orders/{order.order_number}/pay/",
        data={}, format="json",
    )
    assert res.status_code == 201, res.content
    body = res.json()
    assert body["provider_payment_id"] == "pi_test_3Oxxxxxxxxxxxxxx"
    assert body["amount"] == "100.00"
    assert body["client_secret"].startswith("pi_test_")


def test_public_get_payment_status(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    client = APIClient()
    res = client.get(f"/api/v1/payment/public/orders/{order.order_number}/payment/")
    assert res.status_code == 200
    body = res.json()
    assert body["provider_payment_id"] == "pi_test_3Oxxxxxxxxxxxxxx"


def test_public_get_payment_status_404_when_no_payment(
    make_payment_settings, organization_a, make_order
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)

    client = APIClient()
    res = client.get(f"/api/v1/payment/public/orders/{order.order_number}/payment/")
    assert res.status_code == 404


def test_admin_payment_settings_get(
    make_payment_settings, organization_a, user_a
):
    make_payment_settings(organization_a)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.get("/api/v1/payment/admin/payment/settings/")
    assert res.status_code == 200
    body = res.json()
    assert "api_key_masked" in body
    assert "api_key" not in body  # write-only, never in response


def test_admin_payment_settings_put_updates(
    make_payment_settings, organization_a, user_a
):
    make_payment_settings(organization_a)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.put(
        "/api/v1/payment/admin/payment/settings/",
        data={
            "provider_name": "stripe",
            "is_enabled": True,
            "is_test_mode": True,
            "api_key": "sk_test_new_abcdef",
        },
        format="json",
    )
    assert res.status_code == 200
    body = res.json()
    assert body["is_enabled"] is True
    assert "api_key" not in body
    assert "api_key_masked" in body


def test_admin_payment_settings_requires_authentication(organization_a):
    client = APIClient()
    res = client.get("/api/v1/payment/admin/payment/settings/")
    assert res.status_code == 401


def test_admin_refund_create(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order, user_a
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.post(
        "/api/v1/payment/admin/payment/refunds/",
        data={
            "order_number": order.order_number,
            "amount": "50.00",
            "reason": "customer_request",
        },
        format="json",
    )
    assert res.status_code == 201, res.content
    assert RefundRecord.objects.filter(order=order).exists()


def test_admin_refund_create_404_for_wrong_order(
    make_payment_settings, organization_a, user_a
):
    make_payment_settings(organization_a)
    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.post(
        "/api/v1/payment/admin/payment/refunds/",
        data={"order_number": "ZZ-NONEXISTENT-001", "amount": "10.00", "reason": "customer_request"},
        format="json",
    )
    assert res.status_code == 404


def test_admin_reconcile_endpoint(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order, user_a
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.post("/api/v1/payment/admin/payment/reconcile/")
    assert res.status_code == 200
    body = res.json()
    assert "reconciled" in body
    assert "scanned" in body


def test_admin_settlement_endpoint(
    mock_stripe_payment_intent, make_payment_settings, organization_a, make_order, user_a
):
    make_payment_settings(organization_a)
    order = make_order(organization_a)
    create_payment_for_order(order=order)

    client = APIClient()
    client.force_authenticate(user=user_a)
    res = client.get("/api/v1/payment/admin/payment/settlement/")
    assert res.status_code == 200
    body = res.json()
    assert "today" in body
    assert "all_time" in body
    assert "by_provider" in body
