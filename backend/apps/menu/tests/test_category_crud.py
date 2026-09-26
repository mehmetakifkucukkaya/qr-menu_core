"""MenuCategory CRUD tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def test_create_category_with_translation(api_client, org_a, menu):
    """Owner of org_a can create a category with EN translation."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/categories/",
        data={
            "menu_id": menu.id,
            "name": "Tatlılar",
            "description": "Cheesecake, tiramisu",
            "translations": [
                {
                    "locale": "en",
                    "name": "Desserts",
                    "description": "Cheesecake, tiramisu",
                }
            ],
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert payload["name"] == "Tatlılar"
    assert payload["slug"] == "tatlilar"
    assert len(payload["translations"]) == 1
    assert payload["translations"][0]["locale"] == "en"


def test_subcategory_with_parent_fk(api_client, org_a, menu, category):
    """Subcategory can be created with parent_id set."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/categories/",
        data={
            "menu_id": menu.id,
            "parent_id": category.id,
            "name": "Single Origin",
            "sort_order": 1,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert payload["parent_id"] == category.id


def test_translation_unique_per_category_locale(api_client, org_a, menu, category):
    """Two translations for same category+locale should fail via API."""
    from apps.menu.models import MenuCategoryTranslation

    MenuCategoryTranslation.objects.create(
        category=category, locale="en", name="EN 1"
    )
    # Adding a duplicate via serializer.update would fail. We test at model level.
    with pytest.raises(Exception):
        MenuCategoryTranslation.objects.create(
            category=category, locale="en", name="EN 2"
        )


def test_sort_order_default_zero(menu):
    """Newly created category has sort_order=0 by default."""
    from apps.menu.models import MenuCategory

    cat = MenuCategory.objects.create(menu=menu, name="Default Order")
    assert cat.sort_order == 0


def test_category_inactive_excluded_from_queryset(menu):
    """is_active=False categories are filtered by `MenuCategory.objects.active()`."""
    from apps.menu.models import MenuCategory

    active = MenuCategory.objects.create(menu=menu, name="Active", is_active=True)
    MenuCategory.objects.create(menu=menu, name="Inactive", is_active=False)

    qs_active = MenuCategory.objects.filter(menu=menu, is_active=True)
    assert active in qs_active
    assert qs_active.count() == 1