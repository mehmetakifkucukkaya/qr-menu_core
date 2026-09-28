"""Sprint 9C — ``X-Translation-Gaps`` header tests.

Verifies that the public menu endpoint surfaces translation consistency
signals to clients (crawlers, operator tooling, monitoring) via a
response header.

Gap semantics: count the number of (item, target_locale) pairs where
``target_locale`` is a non-default supported locale that has no
``MenuItemTranslation`` row on that item. The default locale's text
lives on the model field itself (see
``apps.menu.services.translation.resolve_item_translation``), so it is
excluded from the count — same semantic as the Sprint 9B
``TranslationGapPanel`` admin UI.

Coverage:
  * zero gaps → header absent (clean signal)
  * partial gaps → header present with the exact count
  * combinatorial multi-item / multi-locale scenario
  * branch-scoped menu participates in the gap count
  * supported_locales falling back to default_locale
  * helper unit tests for ``_count_translation_gaps``

The autouse cache-clear fixture in ``apps/menu/tests/conftest.py``
keeps DRF's anon-IP throttle counter from leaking between tests
(see Sprint 3A throttle pollution history).
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


PUBLIC_URL = "/api/v1/public/menus/{slug}"


def _client() -> APIClient:
    return APIClient()


# ---------------------------------------------------------------------------
# Header integration tests
# ---------------------------------------------------------------------------
def test_no_header_when_zero_gaps(menu, category, item):
    """Item has the only non-default supported locale translated → header absent."""
    from apps.menu.models import MenuItemTranslation

    # Menu fixture: supported=['tr', 'en'], default='tr'. Non-default
    # target is 'en'. Add an 'en' translation row → 0 gaps.
    MenuItemTranslation.objects.create(
        menu_item=item, locale="en", name="V60 EN", description="Single origin"
    )
    res = _client().get(PUBLIC_URL.format(slug=menu.organization.slug))
    assert res.status_code == 200
    assert "X-Translation-Gaps" not in res.headers, (
        f"expected no gap header, got {res.headers.get('X-Translation-Gaps')}"
    )


def test_gap_header_present_when_locale_missing(menu, category, item):
    """Item has no EN translation while menu declares EN as supported → 1 gap.

    The default 'tr' locale is intentionally NOT counted because its
    text lives on the model field — adding an explicit translation row
    for it is redundant. Only non-default supported locales (here: 'en')
    contribute to the count.
    """
    res = _client().get(PUBLIC_URL.format(slug=menu.organization.slug))
    assert res.status_code == 200
    assert res.headers.get("X-Translation-Gaps") == "1"


def test_gap_count_zero_when_only_default_locale(menu, category, item):
    """Menu with supported_locales=['tr'] (same as default) → no gap."""
    menu.supported_locales = ["tr"]
    menu.save()

    res = _client().get(PUBLIC_URL.format(slug=menu.organization.slug))
    assert res.status_code == 200
    assert "X-Translation-Gaps" not in res.headers


def test_gap_count_when_supported_locales_falls_back_to_default(
    menu, category, item
):
    """Empty supported_locales → service falls back to default_locale → no gap."""
    menu.supported_locales = []
    menu.save()

    res = _client().get(PUBLIC_URL.format(slug=menu.organization.slug))
    assert res.status_code == 200
    # Fallback to ['tr']; no non-default target locale → 0 gaps.
    assert "X-Translation-Gaps" not in res.headers


def test_multiple_items_multiple_locales_combinatorial(menu, category):
    """Combinatorial: 3 items × 3 supported locales, mixed translations."""
    from apps.menu.models import MenuItem, MenuItemTranslation

    menu.supported_locales = ["tr", "en", "de"]
    menu.save()

    # Item A — tr (default) + en + de translation rows → 0 non-default gaps
    item_a = MenuItem.objects.create(
        menu=menu, category=category, name="A",
        price=Decimal("10.00"), currency="TRY",
        is_active=True, is_available=True,
    )
    for loc, name in [("tr", "A"), ("en", "A en"), ("de", "A de")]:
        MenuItemTranslation.objects.create(
            menu_item=item_a, locale=loc, name=name, description=""
        )

    # Item B — only EN translated → 1 gap (missing DE; tr is default → ignored)
    item_b = MenuItem.objects.create(
        menu=menu, category=category, name="B",
        price=Decimal("11.00"), currency="TRY",
        is_active=True, is_available=True,
    )
    MenuItemTranslation.objects.create(
        menu_item=item_b, locale="en", name="B en", description=""
    )

    # Item C — no translations at all → 2 gaps (missing EN, DE)
    MenuItem.objects.create(
        menu=menu, category=category, name="C",
        price=Decimal("12.00"), currency="TRY",
        is_active=True, is_available=True,
    )

    res = _client().get(PUBLIC_URL.format(slug=menu.organization.slug))
    assert res.status_code == 200
    assert res.headers.get("X-Translation-Gaps") == "3"  # 0 + 1 + 2


def test_branch_scoped_menu_also_surfaces_gap_header(org_a, menu, category):
    """A branch-scoped menu participates in the gap count, not the org-wide one."""
    from apps.branches.models import Branch
    from apps.menu.models import Menu, MenuItem

    branch = Branch.objects.create(
        organization=org_a, slug="kadikoy", name="Kadıköy", is_active=True
    )
    branch_menu = Menu.objects.create(
        organization=org_a, branch=branch, name="Şube Menüsü", slug="sube",
        default_locale="tr", supported_locales=["tr", "en"],
        is_active=True,
    )
    # 1 item, 0 non-default translations → 1 gap (en missing).
    MenuItem.objects.create(
        menu=branch_menu, category=category, name="Espresso",
        price=Decimal("9.00"), currency="TRY",
        is_active=True, is_available=True,
    )

    res = _client().get(
        PUBLIC_URL.format(slug=org_a.slug), {"branch": branch.slug}
    )
    assert res.status_code == 200
    assert res.headers.get("X-Translation-Gaps") == "1"


def test_default_locale_translation_row_does_not_reduce_gap_count(
    menu, category, item
):
    """Adding an explicit tr translation row is a no-op for the gap count.

    The default locale's text is already on the model field; explicit
    rows for it are stored but don't change coverage. Operator-facing
    gap signals stay focused on actionable translations.
    """
    from apps.menu.models import MenuItemTranslation

    MenuItemTranslation.objects.create(
        menu_item=item, locale="tr", name="V60", description="Single origin"
    )
    res = _client().get(PUBLIC_URL.format(slug=menu.organization.slug))
    assert res.status_code == 200
    # en still missing → 1 gap, not 0.
    assert res.headers.get("X-Translation-Gaps") == "1"


def test_header_absent_on_404():
    """404 responses do not carry the gap header (the menu is missing)."""
    res = _client().get(PUBLIC_URL.format(slug="does-not-exist"))
    assert res.status_code == 404
    assert "X-Translation-Gaps" not in res.headers


# ---------------------------------------------------------------------------
# Helper unit tests
# ---------------------------------------------------------------------------
def test_count_translation_gaps_returns_zero_when_no_menu():
    """Helper handles a None menu gracefully (defensive)."""
    from apps.menu.views_public import _count_translation_gaps

    assert _count_translation_gaps(None) == 0


def test_count_translation_gaps_handles_empty_supported_locales(menu):
    """Empty supported_locales → helper falls back to default_locale → 0."""
    from apps.menu.views_public import _count_translation_gaps

    menu.supported_locales = []
    menu.save()
    # Default 'tr' is the fallback. target = supported - {default} = {}
    # → 0 gaps regardless of translation rows.
    assert _count_translation_gaps(menu) == 0

