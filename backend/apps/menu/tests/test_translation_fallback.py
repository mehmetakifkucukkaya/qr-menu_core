"""Translation fallback service tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_requested_locale_returned_when_exists(menu, category):
    """When a translation for the requested locale exists, it wins."""
    from apps.menu.models import MenuCategoryTranslation
    from apps.menu.services import resolve_category_translation

    MenuCategoryTranslation.objects.create(
        category=category, locale="en", name="Filter Coffee",
        description="V60 etc.",
    )
    result = resolve_category_translation(category, "en")
    assert result["name"] == "Filter Coffee"
    assert result["locale_used"] == "requested"


def test_fallback_to_default_locale_when_missing(menu, category):
    """When EN translation missing but TR translation exists, fallback to TR."""
    from apps.menu.models import MenuCategoryTranslation
    from apps.menu.services import resolve_category_translation

    MenuCategoryTranslation.objects.create(
        category=category, locale="tr", name="Filtre Kahve (TR alt)",
        description="TR desc",
    )
    result = resolve_category_translation(category, "en")
    assert result["name"] == "Filtre Kahve (TR alt)"
    assert result["locale_used"] == "default"


def test_unsupported_locale_uses_default(menu, category):
    """When requesting locale=xx (unsupported) and only TR translation, fall back."""
    from apps.menu.models import MenuCategoryTranslation
    from apps.menu.services import resolve_category_translation

    MenuCategoryTranslation.objects.create(
        category=category, locale="tr", name="Filtre Kahve"
    )
    result = resolve_category_translation(category, "de")
    # 'de' is not in menu.supported_locales; service falls back to default ('tr')
    assert result["locale_used"] == "default"
    assert result["name"] == "Filtre Kahve"


def test_no_translation_uses_default_field(menu, category):
    """When no translations exist at all, return the model's default fields."""
    from apps.menu.services import resolve_category_translation

    result = resolve_category_translation(category, "en")
    assert result["name"] == category.name
    assert result["description"] == category.description
    assert result["locale_used"] == "model"


def test_item_translation_fallback(menu, category, item):
    """Same fallback chain for items."""
    from apps.menu.models import MenuItemTranslation
    from apps.menu.services import resolve_item_translation

    MenuItemTranslation.objects.create(
        menu_item=item, locale="en", name="Single Origin V60"
    )
    result = resolve_item_translation(item, "en")
    assert result["name"] == "Single Origin V60"
    assert result["locale_used"] == "requested"

    result_de = resolve_item_translation(item, "de")
    # Falls back to default 'tr' (model field)
    assert result_de["locale_used"] == "model"
    assert result_de["name"] == item.name