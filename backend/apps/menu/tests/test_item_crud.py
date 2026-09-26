"""MenuItem CRUD tests."""

from __future__ import annotations

from decimal import Decimal

import pytest

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def test_create_item_with_decimal_price(api_client, org_a, menu, category):
    """Create a MenuItem with price=Decimal('12.50') and verify serialization."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "V60",
            "description": "Single origin",
            "price": "12.50",
            "currency": "TRY",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert payload["price"] == "12.50"  # Decimal serialized as string
    assert payload["currency"] == "TRY"


def test_update_price_stays_decimal(api_client, org_a, item):
    """PATCH price returns Decimal in payload, not float."""
    _login(api_client, "owner-a@example.com")
    response = api_client.patch(
        f"/api/v1/admin/menu-items/{item.id}/",
        data={"price": "13.00"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    payload = response.json()["data"]
    assert payload["price"] == "13.00"

    item.refresh_from_db()
    assert isinstance(item.price, Decimal)
    assert item.price == Decimal("13.00")


def test_create_item_with_allergens_and_tags(api_client, org_a, menu, category):
    """Create item with allergen_ids and dietary_tag_ids."""
    from apps.menu.models import Allergen, DietaryTag

    a1 = Allergen.objects.create(code="g1", name={"tr": "Gluten", "en": "Gluten"})
    a2 = Allergen.objects.create(code="d1", name={"tr": "Süt", "en": "Dairy"})
    t1 = DietaryTag.objects.create(code="v1", name={"tr": "Vegan", "en": "Vegan"})

    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "Latte",
            "price": "10.00",
            "allergen_ids": [a1.id, a2.id],
            "dietary_tag_ids": [t1.id],
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert set(payload["allergen_ids"]) == {a1.id, a2.id}
    assert payload["dietary_tag_ids"] == [t1.id]


def test_negative_price_rejected(api_client, org_a, menu, category):
    """API rejects negative price (MinValueValidator)."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "Bad",
            "price": "-5.00",
        },
        format="json",
    )
    assert response.status_code == 400, response.json()
    assert "price" in response.json()


def test_toggle_is_available(api_client, org_a, item):
    """PATCH is_available toggles correctly."""
    _login(api_client, "owner-a@example.com")
    response = api_client.patch(
        f"/api/v1/admin/menu-items/{item.id}/",
        data={"is_available": False},
        format="json",
    )
    assert response.status_code == 200, response.json()
    item.refresh_from_db()
    assert item.is_available is False


def test_featured_popular_new_flags(api_client, org_a, item):
    """Featured / popular / new flags persist."""
    _login(api_client, "owner-a@example.com")
    response = api_client.patch(
        f"/api/v1/admin/menu-items/{item.id}/",
        data={
            "is_featured": True,
            "is_popular": True,
            "is_new": True,
            "spice_level": 2,
        },
        format="json",
    )
    assert response.status_code == 200, response.json()
    item.refresh_from_db()
    assert item.is_featured is True
    assert item.is_popular is True
    assert item.is_new is True
    assert item.spice_level == 2


def test_compare_at_price_must_be_greater_than_price(api_client, org_a, menu, category):
    """compare_at_price < price → validation error."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": category.id,
            "name": "Discounted",
            "price": "10.00",
            "compare_at_price": "8.00",
        },
        format="json",
    )
    assert response.status_code == 400, response.json()
    assert "compare_at_price" in response.json()


def test_item_must_belong_to_same_menu_as_category(api_client, org_a, menu, category):
    """Cannot create item with category from a different menu."""
    from apps.menu.models import Menu, MenuCategory

    other_menu = Menu.objects.create(
        organization=org_a, name="Other Menu", slug="other-menu"
    )
    other_cat = MenuCategory.objects.create(
        menu=other_menu, name="Other Cat"
    )

    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/menu-items/",
        data={
            "menu_id": menu.id,
            "category_id": other_cat.id,
            "name": "Mismatch",
            "price": "5.00",
        },
        format="json",
    )
    assert response.status_code == 400
    assert "category_id" in response.json()