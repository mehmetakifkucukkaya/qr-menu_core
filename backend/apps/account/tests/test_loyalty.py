"""Loyalty ledger + award/redeem tests — Sprint 10A (D-025).

Service-layer coverage. We exercise the public entry points
(``award_points_for_order``, ``redeem_points``, ``customer_balance``)
directly because the view layer is thin glue.

Pattern notes
-------------
* LoyaltySettings is disabled by default — every positive test has
  to opt-in via ``make_loyalty_settings(..., is_enabled=True)``.
* ``customer_balance`` is a signed sum, so mixing + earn / − redeem
  rows yields the running balance.
* ``award_points_for_order`` is idempotent via the
  ``(order, type='earn')`` unique constraint — re-call returns
  ``None`` instead of failing.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.db import transaction
from django.utils import timezone

from apps.account.models import LoyaltySettings, LoyaltyTransaction
from apps.account.services import (
    LoyaltyError,
    award_points_for_order,
    customer_balance,
    redeem_points,
)
from apps.account.tests.factories import (
    make_customer,
    make_earn_txn,
    make_loyalty_settings,
)
from apps.orders.models import Order, OrderStatus
from apps.orders.services import transition_status

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# LoyaltySettings: defaults + admin updates
# ---------------------------------------------------------------------------
def test_loyalty_settings_default_disabled_per_tenant(org_a, org_b):
    """No auto-created settings; first access returns ``None``.

    The admin GET endpoint lazy-creates rows. Tests that want a
    configured tenant must explicitly call ``make_loyalty_settings``.
    """
    assert not hasattr(org_a, "loyalty_settings") or org_a.loyalty_settings is None
    make_loyalty_settings(org_a, is_enabled=False)
    assert org_a.loyalty_settings.is_enabled is False
    # Different tenant = independent config.
    assert not hasattr(org_b, "loyalty_settings") or org_b.loyalty_settings is None


def test_loyalty_settings_admin_can_enable_and_update(org_a):
    settings_obj = make_loyalty_settings(org_a, is_enabled=False)
    settings_obj.is_enabled = True
    settings_obj.points_per_currency_unit = Decimal("2.00")
    settings_obj.redemption_rate = Decimal("0.05")
    settings_obj.min_points_to_redeem = 50
    settings_obj.save()

    settings_obj.refresh_from_db()
    assert settings_obj.is_enabled is True
    assert settings_obj.points_per_currency_unit == Decimal("2.00")
    assert settings_obj.min_points_to_redeem == 50


# ---------------------------------------------------------------------------
# award_points_for_order — service
# ---------------------------------------------------------------------------
def test_award_points_on_order_delivered(org_a, branch_a, menu_a, category_a, item_a):
    settings_obj = make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="earner@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260101-001",
        customer_name="Ali",
        customer_phone="+905320000001",
        total_amount=Decimal("120.00"),
        currency="TRY",
        customer=customer,
    )
    txns_before = LoyaltyTransaction.objects.filter(customer=customer).count()

    # pending → confirmed → preparing → ready → delivered
    transition_status(order, OrderStatus.CONFIRMED)
    transition_status(order, OrderStatus.PREPARING)
    transition_status(order, OrderStatus.READY)

    # No award yet.
    assert (
        LoyaltyTransaction.objects.filter(customer=customer).count()
        == txns_before
    )

    transition_status(order, OrderStatus.DELIVERED)

    earn = LoyaltyTransaction.objects.filter(
        customer=customer, type=LoyaltyTransaction.EARN, order=order
    ).get()
    # 120 * 1.0 = 120 puan.
    assert earn.points == 120
    # Balance reflects the earn.
    assert customer_balance(customer=customer, organization=org_a) == 120


def test_no_award_on_pending_or_cancelled(org_a, branch_a, menu_a, category_a, item_a):
    settings_obj = make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="never@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-001",
        customer_name="Veli",
        customer_phone="+905320000002",
        total_amount=Decimal("100.00"),
        currency="TRY",
        customer=customer,
    )
    # confirmed → cancelled
    transition_status(order, OrderStatus.CONFIRMED)
    transition_status(order, OrderStatus.CANCELLED)
    assert not LoyaltyTransaction.objects.filter(customer=customer).exists()


def test_no_award_when_loyalty_settings_disabled(
    org_a, branch_a, menu_a, category_a, item_a
):
    customer = make_customer(email="noop@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-002",
        customer_name="Veli",
        customer_phone="+905320000002",
        total_amount=Decimal("100.00"),
        currency="TRY",
        customer=customer,
    )
    # No loyalty settings at all.
    transition_status(order, OrderStatus.CONFIRMED)
    transition_status(order, OrderStatus.PREPARING)
    transition_status(order, OrderStatus.READY)
    transition_status(order, OrderStatus.DELIVERED)
    assert not LoyaltyTransaction.objects.filter(customer=customer).exists()


def test_no_award_when_no_customer_attached(org_a, branch_a, menu_a, category_a, item_a):
    """Guest checkout → no FK link → no award.

    Snapshot pricing preserves ``customer_name`` / ``customer_phone``
    on the order; the *loyalty* path requires the ``customer`` FK.
    """
    make_loyalty_settings(org_a, is_enabled=True)
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-003",
        customer_name="Misafir",
        customer_phone="+905320000099",
        total_amount=Decimal("100.00"),
        currency="TRY",
    )
    transition_status(order, OrderStatus.CONFIRMED)
    transition_status(order, OrderStatus.PREPARING)
    transition_status(order, OrderStatus.READY)
    transition_status(order, OrderStatus.DELIVERED)
    assert not LoyaltyTransaction.objects.exists()


def test_award_double_prevented_unique_constraint(
    org_a, branch_a, menu_a, category_a, item_a
):
    """Re-call of ``award_points_for_order`` for same order is a no-op."""
    make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="dup@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-004",
        customer_name="Veli",
        customer_phone="+905320000002",
        total_amount=Decimal("100.00"),
        currency="TRY",
        customer=customer,
    )
    # Force a delivered status without using the state machine so
    # we can call award_points_for_order twice.
    order.status = OrderStatus.DELIVERED
    order.save()
    first = award_points_for_order(order)
    second = award_points_for_order(order)
    assert first is not None
    assert second is None  # IntegrityError handled → no second row
    assert (
        LoyaltyTransaction.objects.filter(
            order=order, type=LoyaltyTransaction.EARN
        ).count()
        == 1
    )


def test_award_respects_loyalty_settings_per_organization(
    org_a, org_b, branch_a, menu_a, category_a, item_a
):
    """Order in org_a + settings enabled → award.
    Same order moved to org_b with settings disabled → no award."""
    make_loyalty_settings(org_a, is_enabled=True)
    # org_b has no settings (so reward is "disabled" by absence).
    customer = make_customer(email="multi-tenant@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-005",
        customer_name="Veli",
        customer_phone="+905320000002",
        total_amount=Decimal("50.00"),
        currency="TRY",
        customer=customer,
    )
    order.status = OrderStatus.DELIVERED
    order.save()
    award_points_for_order(order)
    # Earn happened at org_a.
    assert (
        LoyaltyTransaction.objects.filter(
            customer=customer, organization=org_a
        ).count()
        == 1
    )
    # Nothing at org_b.
    assert (
        LoyaltyTransaction.objects.filter(
            customer=customer, organization=org_b
        ).count()
        == 0
    )


def test_award_respects_custom_earn_rate(
    org_a, branch_a, menu_a, category_a, item_a
):
    """2.00 points_per_currency → order of 50 TL awards 100 puan."""
    make_loyalty_settings(
        org_a,
        is_enabled=True,
        points_per_currency_unit=Decimal("2.0000"),
    )
    customer = make_customer(email="rate@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-006",
        customer_name="Veli",
        customer_phone="+905320000002",
        total_amount=Decimal("50.00"),
        currency="TRY",
        customer=customer,
    )
    order.status = OrderStatus.DELIVERED
    order.save()
    award_points_for_order(order)
    earn = LoyaltyTransaction.objects.get(order=order)
    assert earn.points == 100


# ---------------------------------------------------------------------------
# redeem_points
# ---------------------------------------------------------------------------
def test_redeem_points_validates_balance(org_a, org_b):
    """No balance → LoyaltyError ``loyalty.insufficient_balance``."""
    make_loyalty_settings(org_a, is_enabled=True, min_points_to_redeem=100)
    customer = make_customer(email="broke@example.com")
    with pytest.raises(LoyaltyError) as exc_info:
        redeem_points(
            customer=customer, organization=org_a, points=100
        )
    assert exc_info.value.code == "loyalty.insufficient_balance"


def test_redeem_points_minimum_threshold_enforced(org_a):
    make_loyalty_settings(org_a, is_enabled=True, min_points_to_redeem=100)
    customer = make_customer(email="below@example.com")
    # Earn 200 so balance >> 50.
    make_earn_txn(customer, org_a, points=200)
    with pytest.raises(LoyaltyError) as exc_info:
        redeem_points(
            customer=customer, organization=org_a, points=50
        )
    assert exc_info.value.code == "loyalty.below_threshold"


def test_redeem_points_creates_signed_negative_transaction(org_a):
    make_loyalty_settings(org_a, is_enabled=True, min_points_to_redeem=100)
    customer = make_customer(email="redeem@example.com")
    make_earn_txn(customer, org_a, points=500)
    txn = redeem_points(
        customer=customer, organization=org_a, points=200
    )
    assert txn.type == LoyaltyTransaction.REDEEM
    assert txn.points == -200
    # Balance now 300.
    assert customer_balance(customer=customer, organization=org_a) == 300


def test_customer_balance_correct_after_earn_and_redeem(org_a):
    make_loyalty_settings(org_a, is_enabled=True, min_points_to_redeem=100)
    customer = make_customer(email="ledger@example.com")
    make_earn_txn(customer, org_a, points=500)
    make_earn_txn(customer, org_a, points=300)
    assert customer_balance(customer=customer, organization=org_a) == 800
    # Drop the min threshold to 1 for the second redeem so we exercise
    # the \"small redemption\" branch independently.
    settings_obj = LoyaltySettings.objects.get(organization=org_a)
    settings_obj.min_points_to_redeem = 1
    settings_obj.save()
    redeem_points(customer=customer, organization=org_a, points=150)
    assert customer_balance(customer=customer, organization=org_a) == 650
    redeem_points(customer=customer, organization=org_a, points=50)
    assert customer_balance(customer=customer, organization=org_a) == 600


def test_customer_balance_scoped_to_organization(org_a, org_b):
    make_loyalty_settings(org_a, is_enabled=True, min_points_to_redeem=100)
    # org_b has no settings — but earn directly via the model.
    customer = make_customer(email="scope@example.com")
    make_earn_txn(customer, org_a, points=1000)
    make_earn_txn(customer, org_b, points=100)
    assert customer_balance(customer=customer, organization=org_a) == 1000
    assert customer_balance(customer=customer, organization=org_b) == 100


def test_redeem_points_rejects_when_disabled(org_a):
    make_loyalty_settings(org_a, is_enabled=False)
    customer = make_customer(email="off@example.com")
    with pytest.raises(LoyaltyError) as exc_info:
        redeem_points(
            customer=customer, organization=org_a, points=100
        )
    assert exc_info.value.code == "loyalty.disabled"


def test_redeem_points_rejects_zero_or_negative(org_a):
    make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="zero@example.com")
    for bad in (0, -50):
        with pytest.raises(LoyaltyError) as exc_info:
            redeem_points(
                customer=customer, organization=org_a, points=bad
            )
        assert exc_info.value.code == "loyalty.invalid_points"


# ---------------------------------------------------------------------------
# Idempotency / uniqueness on the model
# ---------------------------------------------------------------------------
def test_unique_earn_per_order_db_constraint(
    org_a, branch_a, menu_a, category_a, item_a
):
    """Two EARN rows for the same Order → IntegrityError at the DB level."""
    from django.db import IntegrityError as DjangoIntegrityError

    make_loyalty_settings(org_a, is_enabled=True)
    customer = make_customer(email="const@example.com")
    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260102-007",
        customer_name="Veli",
        customer_phone="+905320000002",
        total_amount=Decimal("50.00"),
        currency="TRY",
        customer=customer,
    )
    make_earn_txn(customer, org_a, points=50, order=order)
    with pytest.raises(DjangoIntegrityError):
        with transaction.atomic():
            make_earn_txn(customer, org_a, points=50, order=order)


# ---------------------------------------------------------------------------
# Settings default values
# ---------------------------------------------------------------------------
def test_loyalty_settings_default_field_values(org_a):
    s = make_loyalty_settings(org_a)
    assert s.points_per_currency_unit == Decimal("1.0000")
    assert s.redemption_rate == Decimal("0.1000")
    assert s.min_points_to_redeem == 100
    assert s.points_expiry_days is None
    # ``is_enabled`` was set on the create call (default True in our factory).
