"""Visibility service tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_get_active_menu_returns_published_only(org_a, menu):
    """Menu with is_active=False is not returned."""
    from apps.menu.services import get_active_menu

    # Active menu (created by fixture) should be returned
    active = get_active_menu(org_a)
    assert active is not None
    assert active.id == menu.id

    # Deactivate
    menu.is_active = False
    menu.save()
    assert get_active_menu(org_a) is None


def test_get_active_categories_excludes_inactive(menu):
    """Inactive categories are not returned by `get_active_categories`."""
    from apps.menu.models import MenuCategory
    from apps.menu.services import get_active_categories

    active = MenuCategory.objects.create(
        menu=menu, name="Active", is_active=True, sort_order=0
    )
    MenuCategory.objects.create(
        menu=menu, name="Inactive", is_active=False, sort_order=1
    )
    qs = get_active_categories(menu)
    assert active in qs
    assert qs.count() == 1


def test_get_active_items_excludes_unavailable(menu, category):
    """Items with is_active=False or is_available=False are excluded."""
    from apps.menu.models import MenuItem
    from apps.menu.services import get_active_items
    from decimal import Decimal

    ok_item = MenuItem.objects.create(
        menu=menu, category=category, name="OK", price=Decimal("10.00"),
        is_active=True, is_available=True,
    )
    MenuItem.objects.create(
        menu=menu, category=category, name="Unavailable",
        price=Decimal("10.00"), is_active=True, is_available=False,
    )
    MenuItem.objects.create(
        menu=menu, category=category, name="Inactive",
        price=Decimal("10.00"), is_active=False, is_available=True,
    )

    qs = get_active_items(category)
    assert ok_item in qs
    assert qs.count() == 1


def test_get_full_menu_payload_structure(org_a, menu, category):
    """`get_full_menu_payload` returns the expected nested structure."""
    from apps.menu.models import Allergen, DietaryTag, MenuItem
    from apps.menu.services import get_full_menu_payload
    from decimal import Decimal

    a1 = Allergen.objects.create(code="g1", name={"tr": "Gluten", "en": "Gluten"})
    t1 = DietaryTag.objects.create(code="v1", name={"tr": "Vegan", "en": "Vegan"})
    item = MenuItem.objects.create(
        menu=menu, category=category, name="Latte", price=Decimal("10.00"),
        is_active=True, is_available=True,
    )
    item.allergens.add(a1)
    item.dietary_tags.add(t1)

    payload = get_full_menu_payload(org_a, locale="tr")
    assert payload["menu"]["id"] == menu.id
    assert len(payload["categories"]) == 1
    cat_payload = payload["categories"][0]
    assert cat_payload["name"] == "Filtre Kahve"
    assert cat_payload["locale_used"] == "model"  # no translations
    assert len(cat_payload["items"]) == 1
    item_payload = cat_payload["items"][0]
    assert item_payload["name"] == "Latte"
    assert item_payload["price"] == "10.00"
    assert item_payload["allergens"] == ["g1"]
    assert item_payload["dietary_tags"] == ["v1"]
    # Reference data
    assert any(x["code"] == "g1" for x in payload["allergens"])
    assert any(x["code"] == "v1" for x in payload["dietary_tags"])