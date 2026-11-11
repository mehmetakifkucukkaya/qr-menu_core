"""The self-serve signup flow, end to end on the server side.

Covers the two gaps that made the wizard look finished but do nothing:

* ``complete_onboarding`` created a new category row on every call, so a
  retry (lost response, double mount, impatient click) left the tenant
  with two categories of the same name;
* the wizard's step 2 (languages + currency) was collected after the
  tenant was created and never written anywhere, so the tenant always
  ended up with the defaults.

Plus the CSRF contract the browser depends on: the wizard's three writes
go out from the browser, and Django refuses a session-authenticated POST
without an ``X-CSRFToken`` header.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.onboarding import services


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# complete_onboarding — idempotent
# ---------------------------------------------------------------------------


def test_complete_onboarding_twice_leaves_one_category(org_a):
    """The same wizard answer sent twice must not double the menu."""
    payload = {
        "category_name": "Kahvaltı",
        "category_icon": "🥐",
        "items": [
            {"name": "Menemen", "price": "85.00", "description": "Sahanda yumurta"},
        ],
    }

    first_cat, first_items = services.complete_onboarding(org_a, **payload)
    second_cat, second_items = services.complete_onboarding(org_a, **payload)

    assert second_cat.id == first_cat.id
    assert second_items[0].id == first_items[0].id

    categories = MenuCategory.objects.filter(menu__organization=org_a)
    assert categories.count() == 1
    assert MenuItem.objects.filter(menu__organization=org_a).count() == 1


def test_complete_onboarding_updates_the_price_on_a_retry(org_a):
    """A retry that carries a corrected price must apply it."""
    services.complete_onboarding(
        org_a,
        category_name="Kahvaltı",
        items=[{"name": "Menemen", "price": "85.00"}],
    )
    _, items = services.complete_onboarding(
        org_a,
        category_name="Kahvaltı",
        items=[{"name": "Menemen", "price": "90.00"}],
    )
    assert Decimal(items[0].price) == Decimal("90.00")
    assert MenuItem.objects.filter(menu__organization=org_a).count() == 1


def test_complete_onboarding_does_not_touch_another_tenants_category(org_a, org_b):
    """Two tenants may use the same category name — they stay separate."""
    services.complete_onboarding(org_a, category_name="Kahvaltı", items=[])
    services.complete_onboarding(org_b, category_name="Kahvaltı", items=[])

    assert MenuCategory.objects.filter(menu__organization=org_a).count() == 1
    assert MenuCategory.objects.filter(menu__organization=org_b).count() == 1


def test_complete_onboarding_creates_the_tenant_menu_once(org_a):
    services.complete_onboarding(org_a, category_name="Kahvaltı", items=[])
    services.complete_onboarding(org_a, category_name="Kahvaltı", items=[])
    assert Menu.objects.filter(organization=org_a, slug="ana-menu").count() == 1


# ---------------------------------------------------------------------------
# Step 2 — the languages and the currency are persisted
# ---------------------------------------------------------------------------


def test_apply_preferences_writes_the_tenant_and_its_menus(org_a):
    services.complete_onboarding(org_a, category_name="Kahvaltı", items=[])

    updated = services.apply_preferences(
        org_a,
        default_locale="en",
        supported_locales=["en", "de"],
        currency="EUR",
    )

    assert updated.default_locale == "en"
    assert updated.supported_locales == ["en", "de"]
    assert updated.currency == "EUR"

    menu = Menu.objects.get(organization=org_a, slug="ana-menu")
    assert menu.default_locale == "en"
    assert menu.supported_locales == ["en", "de"]


def test_apply_preferences_is_idempotent(org_a):
    for _ in range(2):
        services.apply_preferences(
            org_a,
            default_locale="en",
            supported_locales=["en", "de"],
            currency="EUR",
        )
    org_a.refresh_from_db()
    assert org_a.default_locale == "en"
    assert org_a.currency == "EUR"


def test_preferences_endpoint_persists_the_choices(org_a, user_a):
    client = APIClient()
    client.force_authenticate(user=user_a)

    response = client.post(
        "/api/v1/onboarding/preferences",
        {
            "default_locale": "en",
            "supported_locales": ["en", "de"],
            "currency": "EUR",
        },
        format="json",
    )

    assert response.status_code == 200, response.content
    org_a.refresh_from_db()
    assert org_a.default_locale == "en"
    assert org_a.supported_locales == ["en", "de"]
    assert org_a.currency == "EUR"


def test_preferences_endpoint_rejects_a_default_locale_outside_the_list(
    org_a, user_a
):
    client = APIClient()
    client.force_authenticate(user=user_a)

    response = client.post(
        "/api/v1/onboarding/preferences",
        {
            "default_locale": "de",
            "supported_locales": ["en", "tr"],
            "currency": "EUR",
        },
        format="json",
    )

    assert response.status_code == 400
    org_a.refresh_from_db()
    assert org_a.default_locale == "tr"


def test_preferences_endpoint_rejects_an_unknown_currency(org_a, user_a):
    client = APIClient()
    client.force_authenticate(user=user_a)

    response = client.post(
        "/api/v1/onboarding/preferences",
        {
            "default_locale": "tr",
            "supported_locales": ["tr"],
            "currency": "XBT",
        },
        format="json",
    )

    assert response.status_code == 400


def test_preferences_endpoint_refuses_a_signed_out_caller(org_a):
    client = APIClient()
    response = client.post(
        "/api/v1/onboarding/preferences",
        {"default_locale": "en", "supported_locales": ["en"], "currency": "EUR"},
        format="json",
    )
    assert response.status_code in (401, 403)


# ---------------------------------------------------------------------------
# The browser's writes — CSRF
# ---------------------------------------------------------------------------


def test_the_wizards_writes_need_a_csrf_token(org_a, user_a):
    """Django refuses a session-authenticated POST without the header.

    The wizard used to send none, so every one of its three writes was
    answered with 403 — and the backend tests did not notice, because
    Django's test client does not enforce CSRF unless asked to.
    """
    strict = APIClient(enforce_csrf_checks=True)
    strict.force_login(user_a)

    without_token = strict.post(
        "/api/v1/onboarding/complete",
        {"category_name": "Kahvaltı", "items": [], "skip_items": True},
        format="json",
    )
    assert without_token.status_code == 403, without_token.content
    assert MenuCategory.objects.filter(menu__organization=org_a).count() == 0

    # The same request with a token goes through.
    token = strict.get("/api/v1/auth/csrf").json()["csrfToken"]
    with_token = strict.post(
        "/api/v1/onboarding/complete",
        {"category_name": "Kahvaltı", "items": [], "skip_items": True},
        format="json",
        HTTP_X_CSRFTOKEN=token,
    )
    assert with_token.status_code == 201, with_token.content
    assert MenuCategory.objects.filter(menu__organization=org_a).count() == 1
