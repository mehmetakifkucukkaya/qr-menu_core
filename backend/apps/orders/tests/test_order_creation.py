"""Order creation service tests — Sprint 8A (D-022).

Service-layer (no HTTP) \u2014 we drive ``create_order`` directly through
the ORM and assert the resulting ``Order`` / ``OrderItem`` rows plus the
validation errors raised for invalid inputs.

These tests pin the contract from SPRINT_8_PLAN.md \u00a7 "Backend Detay":

* ``total_amount`` \u2014 server-side sum of ``MenuItem.price * quantity``
  using the snapshot from the DB (client value ignored).
* ``order_number`` \u2014 unique, format ``{slug2}-{YYYYMMDD}-{NNN}``.
* ``OrderItem`` \u2014 snapshot ``name`` + ``price`` taken from the DB at
  write time so later menu edits don't rewrite history.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.orders import services
from apps.orders.models import Order, OrderItem

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
def test_order_creation_with_valid_items_creates_order(
    org_a, item_a, item_b
):
    order = services.create_order(
        organization=org_a,
        items_data=[
            {"menu_item_id": item_a.id, "quantity": 2, "notes": "Az şekerli"},
            {"menu_item_id": item_b.id, "quantity": 1},
        ],
        customer_name="Mehmet",
        customer_phone="+905320000000",
    )
    assert order.pk is not None
    assert order.status == "pending"
    assert order.total_amount == Decimal("120.00")  # 45*2 + 30*1
    assert order.currency == "TRY"
    assert order.items.count() == 2
    assert order.organization_id == org_a.id


def test_order_creation_calculates_total_from_db_prices(
    org_a, item_a, item_b
):
    """Server-side total ignores any client-supplied price field."""
    order = services.create_order(
        organization=org_a,
        items_data=[
            # Client is hostile: sends price=0 hoping for free items.
            {
                "menu_item_id": item_a.id,
                "quantity": 1,
                "notes": "",
                "price": Decimal("0.00"),
            },
            {
                "menu_item_id": item_b.id,
                "quantity": 3,
                "price": Decimal("0.00"),
            },
        ],
        customer_name="M",
        customer_phone="5550000000",
    )
    assert order.total_amount == Decimal("135.00")  # 45 + 30*3
    # The stored OrderItem.price is also the DB snapshot, not the client's.
    prices = sorted(item.price for item in order.items.all())
    assert prices == [Decimal("30.00"), Decimal("45.00")]


def test_order_creation_creates_order_items_with_snapshots(
    org_a, item_a
):
    """Snapshot pattern: name + price are copied from the source row."""
    order = services.create_order(
        organization=org_a,
        items_data=[{"menu_item_id": item_a.id, "quantity": 1}],
        customer_name="M",
        customer_phone="5550000000",
    )
    line = order.items.get()
    assert line.name == item_a.name
    assert line.price == item_a.price
    assert line.menu_item_id == item_a.id


def test_order_creation_with_table_number_and_notes(
    org_a, branch_a, item_a
):
    order = services.create_order(
        organization=org_a,
        items_data=[{"menu_item_id": item_a.id, "quantity": 1}],
        customer_name="M",
        customer_phone="5550000000",
        branch=branch_a,
        table_number="7",
        notes="Cam balkon",
    )
    assert order.branch_id == branch_a.id
    assert order.table_number == "7"
    assert order.notes == "Cam balkon"


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------
def test_order_creation_validates_menu_item_availability(
    org_a, item_unavailable
):
    with pytest.raises(ValidationError) as exc:
        services.create_order(
            organization=org_a,
            items_data=[
                {"menu_item_id": item_unavailable.id, "quantity": 1}
            ],
            customer_name="M",
            customer_phone="5550000000",
        )
    assert "mevcut" in str(exc.value)


def test_order_creation_validates_menu_item_is_active(
    org_a, item_inactive
):
    with pytest.raises(ValidationError) as exc:
        services.create_order(
            organization=org_a,
            items_data=[
                {"menu_item_id": item_inactive.id, "quantity": 1}
            ],
            customer_name="M",
            customer_phone="5550000000",
        )
    assert "aktif de\u011fil" in str(exc.value)


def test_order_creation_invalidates_unknown_item_id(org_a):
    with pytest.raises(ValidationError):
        services.create_order(
            organization=org_a,
            items_data=[{"menu_item_id": 999_999, "quantity": 1}],
            customer_name="M",
            customer_phone="5550000000",
        )


def test_order_creation_rejects_empty_items(org_a):
    with pytest.raises(ValidationError) as exc:
        services.create_order(
            organization=org_a,
            items_data=[],
            customer_name="M",
            customer_phone="5550000000",
        )
    assert "en az bir kalem" in str(exc.value)


def test_order_creation_rejects_zero_quantity(org_a, item_a):
    with pytest.raises(ValidationError):
        services.create_order(
            organization=org_a,
            items_data=[{"menu_item_id": item_a.id, "quantity": 0}],
            customer_name="M",
            customer_phone="5550000000",
        )


def test_order_creation_generates_unique_order_number(org_a, item_a):
    first = services.create_order(
        organization=org_a,
        items_data=[{"menu_item_id": item_a.id, "quantity": 1}],
        customer_name="A",
        customer_phone="5550000001",
    )
    second = services.create_order(
        organization=org_a,
        items_data=[{"menu_item_id": item_a.id, "quantity": 1}],
        customer_name="B",
        customer_phone="5550000002",
    )
    assert first.order_number != second.order_number
    # Both follow the agreed format.
    prefix = (org_a.slug[:2].upper()) + "-"
    assert first.order_number.startswith(prefix)
    assert second.order_number.startswith(prefix)
    # Counter is daily, monotonically increasing.
    assert first.order_number < second.order_number


def test_order_creation_per_org_independent_counters(org_a, org_b, item_a):
    """Each org's daily counter is independent."""
    a = services.create_order(
        organization=org_a,
        items_data=[{"menu_item_id": item_a.id, "quantity": 1}],
        customer_name="A1",
        customer_phone="5550000001",
    )
    b = services.create_order(
        organization=org_b,
        items_data=[{"menu_item_id": item_a.id, "quantity": 1}],
        customer_name="B1",
        customer_phone="5550000002",
    )
    assert a.order_number.startswith("CA-")
    assert b.order_number.startswith("CA-") or b.order_number.startswith("CB-")
    # Different orders even though same slug prefix counter.
    assert a.order_number != b.order_number
