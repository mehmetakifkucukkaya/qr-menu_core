"""Order numbering (SPEC_PILOT_READINESS 5.4).

``order_number`` keeps its format and its global uniqueness, but the daily
suffix now comes from one locked counter row per (scope, key, local day) instead
of ``count() + 1`` (two customers ordering in the same second raced on it), and
the day is the business' local day (Europe/Istanbul), not UTC's. ``daily_seq``
is the short "#12" the kitchen shouts: 1, 2, 3... per business per local day.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone as utc
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.orders import services
from apps.orders.models import Order, OrderCounter, OrderItem

pytestmark = pytest.mark.django_db


def _freeze(monkeypatch, *args):
    """Make "now" a given UTC instant (year, month, day, hour, minute)."""
    instant = datetime(*args, tzinfo=utc.utc)
    monkeypatch.setattr(timezone, "now", lambda: instant)


def _place(org, item, name="Ali"):
    return services.create_order(
        organization=org,
        items_data=[{"menu_item_id": item.id, "quantity": 1}],
        customer_name=name,
        customer_phone="5550000000",
    )


def _item_of(org):
    menu = Menu.objects.create(
        organization=org, name="Ana Menü", slug="ana-menu", default_locale="tr",
        supported_locales=["tr"], is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Kahve", slug="kahve", sort_order=0, is_active=True)
    return MenuItem.objects.create(
        menu=menu, category=category, name="Çay", price=Decimal("30.00"), currency="TRY",
        sort_order=0, is_active=True, is_available=True,
    )


# ------------------------------------------------------------------ the counter


def test_the_counter_counts_per_scope_key_and_day():
    today, tomorrow = date(2026, 10, 5), date(2026, 10, 6)

    assert [services.next_counter("prefix", "CA", today) for _ in range(3)] == [1, 2, 3]
    assert services.next_counter("prefix", "CA", tomorrow) == 1  # a new day restarts
    assert services.next_counter("prefix", "CB", today) == 1  # another key is its own sequence
    assert services.next_counter("org", "CA", today) == 1  # so is another scope


def test_two_requests_creating_the_first_row_of_a_day_do_not_collide(monkeypatch):
    """Both see "no row yet"; the loser of the insert must use the winner's row."""
    day = date(2026, 10, 5)
    # The winner's row, already committed (it served number 5).
    OrderCounter.objects.create(scope="prefix", key="ZZ", day=day, last_value=5)

    class NotSeenYet:
        """A queryset that, like the loser's first read, has not seen the row."""

        def filter(self, **kwargs):
            return self

        def first(self):
            return None

    real_select = OrderCounter.objects.select_for_update
    reads = []

    def select_for_update():
        reads.append(1)
        return NotSeenYet() if len(reads) == 1 else real_select()

    monkeypatch.setattr(OrderCounter.objects, "select_for_update", select_for_update)

    assert services.next_counter("prefix", "ZZ", day) == 6
    assert OrderCounter.objects.get(scope="prefix", key="ZZ", day=day).last_value == 6


# ------------------------------------------------------------------ order_number


def test_the_order_number_format_is_unchanged(org_a):
    assert re.fullmatch(r"CA-\d{8}-\d{3}", services.generate_order_number(org_a))


def test_numbers_continue_after_orders_that_predate_the_counter(org_a, monkeypatch):
    """The first deploy has orders of today and no counter rows yet."""
    _freeze(monkeypatch, 2026, 10, 5, 12, 0)
    for number in ("CA-20261005-001", "CA-20261005-002", "CA-20261005-007", "CA-20261004-099"):
        Order.objects.create(
            organization=org_a, order_number=number, customer_name="x", customer_phone="5",
            total_amount=Decimal("1.00"),
        )

    assert services.generate_order_number(org_a) == "CA-20261005-008"
    assert services.generate_order_number(org_a) == "CA-20261005-009"


def test_the_day_is_the_local_day_not_utcs(org_a, monkeypatch):
    _freeze(monkeypatch, 2026, 10, 5, 20, 30)  # 23:30 in Istanbul, still the 5th
    assert services.generate_order_number(org_a) == "CA-20261005-001"

    _freeze(monkeypatch, 2026, 10, 5, 22, 30)  # 01:30 in Istanbul: the 6th has begun
    assert services.generate_order_number(org_a) == "CA-20261006-001"


def test_businesses_sharing_a_two_letter_prefix_never_share_a_number(org_a, org_b):
    assert (org_a.slug[:2], org_b.slug[:2]) == ("ca", "ca")  # cafe-a, cafe-b
    first = services.generate_order_number(org_a)
    second = services.generate_order_number(org_b)
    assert first != second and first[:-3] == second[:-3]


# ------------------------------------------------------------------ daily_seq


def test_each_business_counts_its_own_orders_per_local_day(org_a, org_b, item_a, monkeypatch):
    item_b = _item_of(org_b)
    _freeze(monkeypatch, 2026, 10, 5, 9, 0)

    seqs = [_place(org_a, item_a).daily_seq, _place(org_a, item_a).daily_seq, _place(org_b, item_b).daily_seq]
    assert seqs == [1, 2, 1]  # the other business starts at 1 too

    _freeze(monkeypatch, 2026, 10, 6, 9, 0)  # next day
    assert _place(org_a, item_a).daily_seq == 1


def test_a_rejected_order_does_not_use_up_a_number(org_a, item_a):
    with pytest.raises(ValidationError):
        services.create_order(
            organization=org_a, items_data=[{"menu_item_id": item_a.id, "quantity": 0}],
            customer_name="M", customer_phone="5550000000",
        )
    order = _place(org_a, item_a)
    assert order.order_number.endswith("-001") and order.daily_seq == 1


def test_a_failure_while_saving_the_lines_rolls_the_numbers_back(org_a, item_a, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(OrderItem.objects, "bulk_create", boom)
    with pytest.raises(RuntimeError):
        _place(org_a, item_a)

    assert not Order.objects.exists() and not OrderCounter.objects.exists()
