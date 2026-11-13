"""What the cook needs on the ticket (SPEC_PILOT_READINESS 5.3).

A line note is at most 120 characters (it is read on a tablet), and the
allergens of a dish are copied onto the order line AT ORDER TIME: a later menu
edit must never change what a past order told the kitchen.
"""

from __future__ import annotations

import pytest

from apps.accounts.models import MembershipRole
from apps.menu.models import Allergen, MenuItemAllergen
from apps.orders import services
from apps.orders.models import OrderItem

pytestmark = pytest.mark.django_db

ORDERS = "/api/v1/public/orders"


def _allergen(code, **name):
    return Allergen.objects.create(code=code, name=name)


def _link(item, *allergens):
    for allergen in allergens:
        MenuItemAllergen.objects.create(menu_item=item, allergen=allergen)


def _place(org, item, notes=""):
    return services.create_order(
        organization=org,
        items_data=[{"menu_item_id": item.id, "quantity": 2, "notes": notes}],
        customer_name="Ali",
        customer_phone="5550000000",
    )


def _body(org, item, notes):
    return {
        "organization_slug": org.slug,
        "customer_name": "Ali",
        "customer_phone": "5550000000",
        "items": [{"menu_item_id": item.id, "quantity": 1, "notes": notes}],
    }


# ------------------------------------------------------------------ allergens


def test_an_order_line_copies_the_turkish_allergen_names_in_a_stable_order(org_a, item_a):
    _link(item_a, _allergen("sut", tr="Süt", en="Milk"), _allergen("gluten", tr="Gluten", en="Gluten"))

    line = _place(org_a, item_a).items.get()

    assert line.allergens == ["Gluten", "Süt"]  # by code, whatever order they were linked in


def test_a_dish_without_allergens_has_an_empty_list(org_a, item_a):
    assert _place(org_a, item_a).items.get().allergens == []


def test_a_name_missing_in_turkish_falls_back_to_english_then_to_the_code(org_a, item_a):
    _link(item_a, _allergen("soya", en="Soy"), _allergen("zzz"))
    assert _place(org_a, item_a).items.get().allergens == ["Soy", "zzz"]


def test_later_menu_edits_do_not_rewrite_past_orders(org_a, item_a):
    gluten = _allergen("gluten", tr="Gluten")
    _link(item_a, gluten)
    line = _place(org_a, item_a).items.get()

    MenuItemAllergen.objects.filter(menu_item=item_a).delete()
    _link(item_a, _allergen("sut", tr="Süt"))
    gluten.name = {"tr": "Buğday"}
    gluten.save()

    assert OrderItem.objects.get(pk=line.pk).allergens == ["Gluten"]
    assert _place(org_a, item_a).items.get().allergens == ["Süt"]


# ------------------------------------------------------------------ notes


def test_a_line_note_of_exactly_120_characters_is_kept(api_client, org_a, item_a):
    note = "ş" * 120
    response = api_client.post(ORDERS, _body(org_a, item_a, note), format="json")
    assert response.status_code == 201, response.content
    assert OrderItem.objects.get().notes == note


def test_a_longer_line_note_is_refused(api_client, org_a, item_a):
    response = api_client.post(ORDERS, _body(org_a, item_a, "x" * 121), format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.invalid_payload"
    assert "notes" in str(response.json()["error"]["details"])


def test_the_service_never_stores_more_than_120_characters(org_a, item_a):
    assert len(_place(org_a, item_a, notes="y" * 300).items.get().notes) == 120


# ------------------------------------------------------------------ the owner's order page


def test_the_order_detail_shows_the_allergens_of_each_line(api_client, org_a, item_a):
    _link(item_a, _allergen("gluten", tr="Gluten"))
    order = _place(org_a, item_a)
    owner = org_a.memberships.get(role=MembershipRole.OWNER).user
    api_client.force_login(owner)

    response = api_client.get(f"/api/v1/admin/orders/{order.pk}")

    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["allergens"] == ["Gluten"]
