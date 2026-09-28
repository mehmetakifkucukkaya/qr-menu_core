"""Test factories for the AI translate / describe app — Sprint 9A.

Kept in a separate module so individual test files can ``from
factories import make_item`` without re-typing the boilerplate.

The factories wrap the canonical ``apps.menu.models`` constructors
rather than duplicating them — the menu app already owns the schema,
this module just gives us short call-sites:

    item = make_item(org=org_a, name="Türk Kahvesi", price=Decimal("45.00"))
"""

from __future__ import annotations

from decimal import Decimal

from apps.menu.models import (
    Allergen,
    DietaryTag,
    Menu,
    MenuCategory,
    MenuItem,
)
from apps.organizations.models import Organization


def make_menu(org: Organization, name: str = "Test Menü") -> Menu:
    return Menu.objects.create(
        organization=org,
        name=name,
        description="",
        default_locale="tr",
        supported_locales=["tr", "en"],
        is_active=True,
    )


def make_category(
    menu: Menu, name: str = "Genel", sort_order: int = 0
) -> MenuCategory:
    return MenuCategory.objects.create(
        menu=menu,
        name=name,
        sort_order=sort_order,
        is_active=True,
    )


def make_item(
    category: MenuCategory,
    menu: Menu,
    name: str = "Test Ürün",
    price: Decimal | None = Decimal("45.00"),
    description: str = "",
) -> MenuItem:
    return MenuItem.objects.create(
        menu=menu,
        category=category,
        name=name,
        description=description,
        price=price if price is not None else Decimal("0.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )


def make_allergen(code: str = "gluten", name_tr: str = "Gluten") -> Allergen:
    """Create or fetch a global Allergen row.

    The Allergen table is global (not tenant-scoped) so we look up
    by code first to keep tests idempotent across reruns.
    """
    allergen, _ = Allergen.objects.get_or_create(
        code=code,
        defaults={"name": {"tr": name_tr, "en": code.title()}},
    )
    return allergen


def make_dietary_tag(code: str = "vegan", name_tr: str = "Vegan") -> DietaryTag:
    tag, _ = DietaryTag.objects.get_or_create(
        code=code,
        defaults={"name": {"tr": name_tr, "en": code.title()}},
    )
    return tag
