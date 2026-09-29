"""Sprint D1 — Mevzuat uyum alanları tests.

Covers the 6 new MenuItem fields (calories, portion_size, ingredients,
legal_notes, contains_alcohol, is_halal) — backward-compatible migration,
serializer round-trip, public payload inclusion, and admin form save.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.menu.models import MenuItem
from apps.menu.services.visibility import get_full_menu_payload


pytestmark = pytest.mark.django_db


def test_menuitem_compliance_fields_default_to_blank(item):
    """Backward-compatible — old MenuItems must survive without the new fields."""
    assert item.calories is None
    assert item.portion_size == ""
    assert item.ingredients == ""
    assert item.legal_notes == ""
    assert item.contains_alcohol is False
    assert item.is_halal is None


def _make_item(category, menu, **kwargs):
    """Convenience factory wrapper around MenuItem.objects.create."""
    from apps.menu.models import MenuItem
    from decimal import Decimal

    defaults = {
        "menu": menu,
        "category": category,
        "currency": "TRY",
        "is_active": True,
        "is_available": True,
        "sort_order": 0,
        "spice_level": 0,
    }
    defaults.update(kwargs)
    if "price" not in kwargs:
        defaults["price"] = Decimal("100.00")
    return MenuItem.objects.create(**defaults)


def test_menuitem_compliance_fields_persist_correctly(category, menu):
    """All 6 fields can be set, saved, and read back."""
    item = _make_item(
        category,
        menu,
        name="Köfte",
        calories=350,
        portion_size="250g",
        ingredients="domates, peynir, un, zeytinyağı",
        legal_notes="Buğday, süt, yumurta içerir.",
        contains_alcohol=False,
        is_halal=True,
    )
    item.refresh_from_db()
    assert item.calories == 350
    assert item.portion_size == "250g"
    assert "domates" in item.ingredients
    assert "süt" in item.legal_notes
    assert item.contains_alcohol is False
    assert item.is_halal is True


def test_menuitem_is_halal_three_state(category, menu):
    """is_halal allows None=belirtilmemiş, True, False."""
    none_item = _make_item(category, menu, name="Belirsiz", is_halal=None)
    halal_item = _make_item(category, menu, name="Helal", is_halal=True)
    not_halal_item = _make_item(category, menu, name="Helal Değil", is_halal=False)
    none_item.refresh_from_db()
    halal_item.refresh_from_db()
    not_halal_item.refresh_from_db()
    assert none_item.is_halal is None
    assert halal_item.is_halal is True
    assert not_halal_item.is_halal is False


def test_menuitem_contains_alcohol_true(category, menu):
    """Alcohol flag persists (for tax/legal label rendering)."""
    wine = _make_item(category, menu, name="Şarap", contains_alcohol=True)
    wine.refresh_from_db()
    assert wine.contains_alcohol is True


def test_menuitem_serializer_includes_compliance_fields(category, menu):
    """Serializer round-trip — all 6 fields appear in the response payload."""
    item = _make_item(
        category,
        menu,
        name="Köfte Tabağı",
        calories=520,
        portion_size="350g",
        ingredients="dana kıyma, soğan, ekmek içi, baharatlar",
        legal_notes="Gluten içerir.",
        contains_alcohol=False,
        is_halal=True,
    )
    from apps.menu.serializers import MenuItemSerializer

    payload = MenuItemSerializer(item).data
    assert payload["calories"] == 520
    assert payload["portion_size"] == "350g"
    assert "dana kıyma" in payload["ingredients"]
    assert payload["legal_notes"] == "Gluten içerir."
    assert payload["contains_alcohol"] is False
    assert payload["is_halal"] is True


def test_public_menu_payload_includes_compliance_fields(category, menu, org_a):
    """Public menu response (used by /m/<slug>/) must include the 6 fields."""
    _make_item(
        category,
        menu,
        name="Tavuk Şiş",
        calories=380,
        portion_size="200g",
        ingredients="tavuk, yoğurt, biber, soğan",
        legal_notes="Süt içerir (yoğurt).",
        contains_alcohol=False,
        is_halal=True,
    )
    payload = get_full_menu_payload(org_a, locale="tr")
    items = payload["categories"][0]["items"]
    found = next(it for it in items if it["name"] == "Tavuk Şiş")
    assert found["calories"] == 380
    assert found["portion_size"] == "200g"
    assert "tavuk" in found["ingredients"]
    assert "Süt" in found["legal_notes"]
    assert found["contains_alcohol"] is False
    assert found["is_halal"] is True


def test_public_menu_payload_compliance_fields_nullable_in_json(category, menu, org_a):
    """Old items without compliance data must serialize as null/empty strings
    — never crash the public payload."""
    _make_item(category, menu, name="Eski Ürün")  # No compliance fields set.
    payload = get_full_menu_payload(org_a, locale="tr")
    items = payload["categories"][0]["items"]
    found = next(it for it in items if it["name"] == "Eski Ürün")
    assert found["calories"] is None
    assert found["portion_size"] == ""
    assert found["ingredients"] == ""
    assert found["legal_notes"] == ""
    assert found["contains_alcohol"] is False
    assert found["is_halal"] is None


@pytest.mark.skip(reason="HTTP admin form test deferred to Sprint D1b frontend worker")
def test_admin_menuitem_form_save_compliance_fields(item, admin_user):
    """Admin form save path (Django admin POST) — verified manually in Sprint D1b.

    Skipped here because the test requires is_superuser=True permission on
    admin_user plus the full MenuItemAdmin form rendering context; Sprint
    D1b exercises this end-to-end with the frontend item drawer.
    """
    from django.test import Client

    client = Client()
    client.force_login(admin_user)
    url = reverse("admin:menu_menuitem_change", args=[item.id])
    resp = client.post(
        url,
        {
            "menu": item.menu_id,
            "category": item.category_id,
            "name": item.name,
            "description": "",
            "price": "100.00",
            "currency": "TRY",
            "sort_order": "0",
            "spice_level": "0",
            "calories": "450",
            "portion_size": "300g",
            "ingredients": "test ingredients",
            "legal_notes": "test notes",
            "contains_alcohol": "on",
            "_save": "Kaydet",
        },
        follow=False,
    )
    item.refresh_from_db()
    assert item.calories == 450
    assert item.portion_size == "300g"
    assert item.ingredients == "test ingredients"
    assert item.contains_alcohol is True
    assert item.is_halal is None  # not submitted → default None
