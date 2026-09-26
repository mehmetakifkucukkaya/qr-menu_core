"""Reorder service + endpoint tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def test_reorder_categories_updates_sort_order(menu, category):
    """`reorder_categories` rewrites sort_order per the given id order."""
    from apps.menu.models import MenuCategory
    from apps.menu.services import reorder_categories

    c1 = MenuCategory.objects.create(menu=menu, name="C1", sort_order=0)
    c2 = MenuCategory.objects.create(menu=menu, name="C2", sort_order=1)
    c3 = MenuCategory.objects.create(menu=menu, name="C3", sort_order=2)
    # Reverse order: c3, c2, c1
    reorder_categories(menu, [c3.id, c2.id, c1.id])

    c1.refresh_from_db()
    c2.refresh_from_db()
    c3.refresh_from_db()
    assert c3.sort_order == 0
    assert c2.sort_order == 1
    assert c1.sort_order == 2


def test_reorder_items_within_category(menu, category):
    """`reorder_items` rewrites sort_order within a category."""
    from apps.menu.models import MenuItem
    from apps.menu.services import reorder_items
    from decimal import Decimal

    i1 = MenuItem.objects.create(
        menu=menu, category=category, name="I1", price=Decimal("1")
    )
    i2 = MenuItem.objects.create(
        menu=menu, category=category, name="I2", price=Decimal("2")
    )
    i3 = MenuItem.objects.create(
        menu=menu, category=category, name="I3", price=Decimal("3")
    )
    reorder_items(category, [i3.id, i1.id, i2.id])

    i1.refresh_from_db()
    i2.refresh_from_db()
    i3.refresh_from_db()
    assert i3.sort_order == 0
    assert i1.sort_order == 1
    assert i2.sort_order == 2


def test_reorder_validates_ownership(menu, category, org_b):
    """Cannot reorder categories from another organization."""
    from apps.menu.models import MenuCategory
    from apps.menu.services import reorder_categories

    # Create a category belonging to org_b
    from apps.menu.models import Menu
    from apps.organizations.models import Organization

    # Note: category fixture is under org_a via menu fixture
    # For org_b, create its own menu + category
    other_menu = Menu.objects.create(
        organization=org_b, name="Other", slug="other"
    )
    other_cat = MenuCategory.objects.create(menu=other_menu, name="OtherC")

    with pytest.raises(ValueError):
        reorder_categories(menu, [other_cat.id])


def test_reorder_endpoint_rejects_unknown_id(api_client, org_a, menu):
    """POST /categories/reorder with unknown id returns 400."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/categories/reorder",
        data={"menu_id": menu.id, "ordered_ids": [999]},
        format="json",
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "validation.reorder_failed"


def test_reorder_endpoint_requires_auth(api_client, org_a, menu):
    """POST /categories/reorder without auth → 403."""
    response = api_client.post(
        "/api/v1/admin/categories/reorder",
        data={"menu_id": menu.id, "ordered_ids": [1]},
        format="json",
    )
    assert response.status_code in (401, 403)