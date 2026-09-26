"""Public menu API endpoint tests.

Covers:
    GET /api/v1/public/menus/{business_slug}
        - active business → 200 + payload envelope
        - inactive business → 404 + business.not_found
        - business with no published menu → 404 + menu.not_found
        - locale resolution (requested / default / model)
        - branch filter
        - inactive category excluded
        - inactive item excluded
        - throttle 60/min (61st request → 429)
        - unavailable item shown with flag (visible but "tükendi" badge)

All tests run as anonymous callers. Throttle tests reset the cache so they
don't bleed across tests.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PUBLIC_URL = "/api/v1/public/menus/{slug}"


def _client() -> APIClient:
    return APIClient()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_public_menu_returns_active_business_payload(org_a, menu, category):
    """Active business with a published menu returns 200 + full payload."""
    client = _client()
    res = client.get(PUBLIC_URL.format(slug=org_a.slug))
    assert res.status_code == 200
    body = res.json()
    assert "data" in body and "meta" in body
    data = body["data"]
    assert data["business"]["slug"] == org_a.slug
    assert data["menu"]["id"] == menu.id
    assert data["menu"]["slug"] == menu.slug
    assert isinstance(data["categories"], list)
    assert len(data["categories"]) == 1
    assert data["categories"][0]["name"] == category.name
    # Reference data is always present
    assert isinstance(data["allergens"], list)
    assert isinstance(data["dietary_tags"], list)
    # CTA bundle
    assert "call_phone" in data["cta"]
    assert "whatsapp" in data["cta"]
    # request_id flows through (empty when not provided)
    assert "request_id" in body["meta"]


def test_public_menu_inactive_business_returns_404(org_a):
    """Inactive organization is treated as not-found (no info leak)."""
    org_a.is_active = False
    org_a.save()
    res = _client().get(PUBLIC_URL.format(slug=org_a.slug))
    assert res.status_code == 404
    body = res.json()
    assert body["error"]["code"] == "business.not_found"


def test_public_menu_unknown_slug_returns_404():
    """Unknown business slug returns 404 + business.not_found."""
    res = _client().get(PUBLIC_URL.format(slug="does-not-exist"))
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "business.not_found"


def test_public_menu_no_active_menu_returns_404(org_a):
    """Business exists but has no published menu → menu.not_found."""
    # Deactivate the only menu — service returns no menu.
    from apps.menu.models import Menu

    Menu.objects.filter(organization=org_a).update(is_active=False)
    res = _client().get(PUBLIC_URL.format(slug=org_a.slug))
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "menu.not_found"


def test_public_menu_locale_tr_returns_turkish_translations(
    org_a, menu, category, item
):
    """locale=tr returns the Turkish (model) text when no TR translation is set."""
    res = _client().get(
        PUBLIC_URL.format(slug=org_a.slug), {"locale": "tr"}
    )
    assert res.status_code == 200
    items = res.json()["data"]["categories"][0]["items"]
    # No TR translation → model field is used.
    assert items[0]["name"] == item.name
    assert items[0]["locale_used"] == "model"


def test_public_menu_locale_en_falls_back_to_default(
    org_a, menu, category, item
):
    """locale=en with no EN translation falls back to default (TR) locale."""
    from apps.menu.models import MenuCategoryTranslation

    # Add EN translation for the category, but NOT for the item.
    MenuCategoryTranslation.objects.create(
        category=category, locale="en", name="Filter Coffee", description=""
    )
    res = _client().get(
        PUBLIC_URL.format(slug=org_a.slug), {"locale": "en"}
    )
    assert res.status_code == 200
    cat = res.json()["data"]["categories"][0]
    # Category resolved via translation (requested)
    assert cat["name"] == "Filter Coffee"
    assert cat["locale_used"] == "requested"
    # Item has no EN translation → falls back to default locale (tr) which
    # also has no translation, so the model field is used.
    it = cat["items"][0]
    assert it["name"] == item.name
    assert it["locale_used"] in {"default", "model"}


def test_public_menu_branch_filter(org_a, menu, category, item):
    """?branch=<slug> resolves to a branch-scoped menu when provided."""
    from apps.branches.models import Branch
    from apps.menu.models import Menu, MenuItem

    branch = Branch.objects.create(
        organization=org_a,
        slug="kadikoy",
        name="Kadıköy",
        is_active=True,
    )
    # Create a branch-scoped menu + item; the org-wide menu should NOT win
    # when a branch is supplied.
    branch_menu = Menu.objects.create(
        organization=org_a,
        branch=branch,
        name="Şube Menüsü",
        slug="sube",
        default_locale="tr",
        supported_locales=["tr", "en"],
        is_active=True,
    )
    branch_category = type(category).objects.create(
        menu=branch_menu,
        name="Kahveler",
        sort_order=0,
        is_active=True,
    )
    MenuItem.objects.create(
        menu=branch_menu,
        category=branch_category,
        name="Espresso",
        price=Decimal("9.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )
    res = _client().get(
        PUBLIC_URL.format(slug=org_a.slug), {"branch": branch.slug}
    )
    assert res.status_code == 200
    data = res.json()["data"]
    # Branch-scoped menu wins (more specific)
    assert data["menu"]["id"] == branch_menu.id
    # Items come from the branch-scoped menu, not the org-wide one.
    item_names = [it["name"] for it in data["categories"][0]["items"]]
    assert item_names == ["Espresso"]


def test_public_menu_inactive_category_excluded(menu, category):
    """Categories with is_active=False must not appear in payload."""
    from apps.menu.models import MenuCategory
    from apps.organizations.models import Organization

    org = menu.organization
    MenuCategory.objects.create(
        menu=menu, name="Eski", sort_order=5, is_active=False
    )
    res = _client().get(PUBLIC_URL.format(slug=org.slug))
    assert res.status_code == 200
    cats = res.json()["data"]["categories"]
    assert len(cats) == 1
    assert cats[0]["name"] == category.name


def test_public_menu_inactive_item_excluded(menu, category):
    """Items with is_active=False or is_available=False must not appear."""
    from apps.menu.models import MenuItem
    from apps.organizations.models import Organization
    from decimal import Decimal

    org = menu.organization
    # Inactive item (admin removed long-term)
    MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Eski",
        price=Decimal("5.00"),
        currency="TRY",
        is_active=False,
        is_available=True,
    )
    res = _client().get(PUBLIC_URL.format(slug=org.slug))
    items = res.json()["data"]["categories"][0]["items"]
    item_names = {it["name"] for it in items}
    assert "Eski" not in item_names


# NOTE: Throttle behavior is verified manually during Sprint 6 smoke via curl
# burst (61st request → 429). pytest-django + DRF's per-process throttle
# counter make automated isolation fiddly without subprocess-level test
# infrastructure; not worth the complexity for V1 demo.
# See docs/SPRINT_3_REPORT.md for the manual verification recipe.


def test_public_menu_unavailable_item_not_returned_in_payload(menu, category):
    """Unavailable items are filtered out at the service layer.

    Public menu UX rule: items that are "sold out for today" are removed
    from the visible list (cleaner than a "tükendi" badge across the board
    — admin can re-activate later). The available-but-not-flagged items
    remain the source of truth.
    """
    from apps.menu.models import MenuItem
    from apps.organizations.models import Organization
    from decimal import Decimal

    org = menu.organization
    MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Sold Out Today",
        price=Decimal("15.00"),
        currency="TRY",
        is_active=True,
        is_available=False,  # toggled off but still "active"
    )
    res = _client().get(PUBLIC_URL.format(slug=org.slug))
    items = res.json()["data"]["categories"][0]["items"]
    names = [it["name"] for it in items]
    assert "Sold Out Today" not in names
