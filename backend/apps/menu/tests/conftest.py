"""Shared fixtures for menu app tests.

Reuses `org_a` / `org_b` / `admin_user` from the root conftest, and adds
menu/category/item fixtures scoped to org_a by default.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


@pytest.fixture
def menu(org_a):
    from apps.menu.models import Menu

    return Menu.objects.create(
        organization=org_a,
        name="Kahve Menüsü",
        description="Birinci menü",
        default_locale="tr",
        supported_locales=["tr", "en"],
        is_active=True,
    )


@pytest.fixture
def category(menu):
    from apps.menu.models import MenuCategory

    return MenuCategory.objects.create(
        menu=menu,
        name="Filtre Kahve",
        sort_order=0,
        is_active=True,
    )


@pytest.fixture
def item(category, menu):
    from apps.menu.models import MenuItem
    from decimal import Decimal

    return MenuItem.objects.create(
        menu=menu,
        category=category,
        name="V60",
        description="Tek origin filtre kahve",
        price=Decimal("12.50"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )