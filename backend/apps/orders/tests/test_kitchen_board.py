"""``GET /api/v1/admin/kitchen/board`` (SPEC_PILOT_READINESS 5.1): the kitchen's
three columns in one call - what is NEW, what is being PREPARED, what is READY -
with everything the cook needs on a card and nothing they should not see."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.accounts.models import Membership, MembershipRole, User
from apps.menu.models import Allergen, MenuItemAllergen
from apps.orders.models import Order, OrderItem

pytestmark = pytest.mark.django_db

BOARD = "/api/v1/admin/kitchen/board"

#: Noon at the venue (09:00 UTC; Europe/Istanbul is UTC+3), far from the midnight
#: at which "today" changes.
NOW = datetime(2026, 10, 5, 9, 0, tzinfo=dt_timezone.utc)


@pytest.fixture(autouse=True)
def _pinned_clock(monkeypatch):
    """"Stale" means placed before the venue's local midnight, so "3 minutes ago"
    is only reliable while the real clock is not within 3 minutes of midnight
    (these tests failed there): the clock is pinned to noon instead."""
    monkeypatch.setattr(timezone, "now", lambda: NOW)


def _login(api_client, org):
    api_client.force_login(org.memberships.get(role=MembershipRole.OWNER).user)


def _order(org, number, status="pending", minutes_ago=0, **extra):
    order = Order.objects.create(
        organization=org, order_number=number, customer_name=extra.pop("customer_name", "Ali"),
        customer_phone="+905321112233", total_amount=Decimal("45.00"), status=status, **extra,
    )
    Order.objects.filter(pk=order.pk).update(placed_at=NOW - timedelta(minutes=minutes_ago))
    return order


def _numbers(response, column):
    return [card["order_number"] for card in response.json()["data"]["columns"][column]]


# ------------------------------------------------------------------ columns


def test_the_three_columns_hold_the_right_statuses_oldest_first(api_client, org_a):
    _order(org_a, "N-2", "pending", minutes_ago=2)
    _order(org_a, "N-1", "pending", minutes_ago=9)
    _order(org_a, "P-2", "preparing", minutes_ago=5)
    _order(org_a, "P-1", "confirmed", minutes_ago=7)
    _order(org_a, "R-1", "ready", minutes_ago=12)
    _order(org_a, "D-1", "delivered", minutes_ago=30)
    _order(org_a, "C-1", "cancelled", minutes_ago=30)
    _login(api_client, org_a)

    response = api_client.get(BOARD)

    assert response.status_code == 200, response.content
    assert _numbers(response, "new") == ["N-1", "N-2"]
    assert _numbers(response, "preparing") == ["P-1", "P-2"]  # confirmed + preparing together
    assert _numbers(response, "ready") == ["R-1"]
    data = response.json()["data"]
    assert data["counts"] == {"new": 2, "preparing": 2, "ready": 1}
    assert data["truncated"] is False
    assert data["server_time"]


def test_an_empty_board_is_three_empty_columns(api_client, org_a):
    _login(api_client, org_a)
    data = api_client.get(BOARD).json()["data"]
    assert data["columns"] == {"new": [], "preparing": [], "ready": []}
    assert data["counts"] == {"new": 0, "preparing": 0, "ready": 0}


# ------------------------------------------------------------------ the card


def test_a_card_carries_what_the_cook_needs_and_not_the_customers_phone(api_client, org_a, item_a):
    gluten = Allergen.objects.create(code="gluten", name={"tr": "Gluten"})
    MenuItemAllergen.objects.create(menu_item=item_a, allergen=gluten)
    order = _order(
        org_a, "CA-1", "pending", minutes_ago=3, table_number="12", daily_seq=7,
        notes="Doğum günü, mum lütfen", customer_name="Zeynep",
    )
    OrderItem.objects.create(
        order=order, menu_item=item_a, name="Türk Kahvesi", price=Decimal("45.00"), quantity=2,
        notes="şekersiz", allergens=["Gluten"],
    )
    _login(api_client, org_a)

    response = api_client.get(BOARD)
    card = response.json()["data"]["columns"]["new"][0]

    assert card["id"] == order.id and card["order_number"] == "CA-1"
    assert (card["daily_seq"], card["status"], card["table_number"]) == (7, "pending", "12")
    assert card["customer_name"] == "Zeynep"
    assert card["order_notes"] == "Doğum günü, mum lütfen"
    assert 170 <= card["age_seconds"] <= 200 and card["is_stale"] is False
    assert card["items"] == [
        {"id": order.items.get().id, "name": "Türk Kahvesi", "quantity": 2, "notes": "şekersiz",
         "allergens": ["Gluten"]}
    ]
    raw = response.content.decode()
    assert "customer_phone" not in raw and "5321112233" not in raw  # the phone stays off the wall


def test_an_order_from_before_today_is_marked_stale(api_client, org_a):
    _order(org_a, "OLD-1", "preparing", minutes_ago=60 * 36)
    _order(org_a, "NEW-1", "preparing", minutes_ago=5)
    _login(api_client, org_a)

    cards = {c["order_number"]: c for c in api_client.get(BOARD).json()["data"]["columns"]["preparing"]}

    assert cards["OLD-1"]["is_stale"] is True
    assert cards["NEW-1"]["is_stale"] is False


# ------------------------------------------------------------------ scope and limits


def test_only_the_signed_in_business_is_listed(api_client, org_a, org_b):
    _order(org_a, "A-1")
    _order(org_b, "B-1")
    _login(api_client, org_a)

    data = api_client.get(BOARD).json()["data"]

    assert _numbers(api_client.get(BOARD), "new") == ["A-1"]
    assert data["counts"]["new"] == 1


def test_the_board_shows_at_most_100_cards_and_says_so(api_client, org_a):
    Order.objects.bulk_create(
        [
            Order(organization=org_a, order_number=f"BULK-{i:03d}", customer_name="x",
                  customer_phone="5", total_amount=Decimal("1.00"), status="pending")
            for i in range(101)
        ]
    )
    _login(api_client, org_a)

    data = api_client.get(BOARD).json()["data"]

    assert len(data["columns"]["new"]) == 100
    assert data["counts"]["new"] == 101  # the real total, not the shown cards
    assert data["truncated"] is True


def test_the_number_of_queries_does_not_grow_with_the_number_of_cards(
    api_client, org_a, item_a, django_assert_max_num_queries
):
    for i in range(12):
        order = _order(org_a, f"Q-{i:02d}", ["pending", "preparing", "ready"][i % 3])
        for n in range(3):
            OrderItem.objects.create(
                order=order, menu_item=item_a, name=f"Ürün {n}", price=Decimal("5.00"), quantity=1,
                allergens=["Gluten"],
            )
    _login(api_client, org_a)

    with django_assert_max_num_queries(12):
        assert api_client.get(BOARD).status_code == 200


# ------------------------------------------------------------------ who


def test_every_role_that_may_see_the_kitchen_can_read_the_board(api_client, org_a):
    _order(org_a, "A-1")
    for role in (MembershipRole.KITCHEN, MembershipRole.STAFF, MembershipRole.MANAGER):
        user = User.objects.create_user(email=f"{role}@a.example", password="x", role="staff")
        Membership.objects.create(user=user, organization=org_a, role=role)
        api_client.force_login(user)
        assert _numbers(api_client.get(BOARD), "new") == ["A-1"], role


def test_a_stranger_gets_nothing(api_client, org_a):
    assert api_client.get(BOARD).status_code in (401, 403)
    stranger = User.objects.create_user(email="x@x.example", password="x", role="staff")
    api_client.force_login(stranger)
    assert api_client.get(BOARD).status_code == 403  # tied to no business
