"""Every feature guard answers "not in your plan" the same way (D-047).

Five views guard five different features, and before this test they did not
agree on the answer: the payment guard put the code at the top level under
``detail`` while the others nested it under ``error``. A client that wanted
to say "your plan does not include this" had to guess which shape it was
looking at, and the payment answer fell through to a generic "api.error".

One envelope, one contract — so one client can read all of them:

.. code-block:: json

    {"error": {"code": "billing.feature_disabled",
               "message": "<Turkish>",
               "feature": "<flag>"},
     "meta": {"request_id": ""}}
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.billing.constants import BASIC, default_features
from apps.billing.models import PlanSettings
from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.orders.models import Order, OrderItem

pytestmark = pytest.mark.django_db


def _basic(org) -> None:
    """Pin the tenant to BASIC: every feature flag off."""
    PlanSettings.objects.update_or_create(
        organization=org,
        defaults={"active_plan": BASIC, **default_features(BASIC)},
    )


def _login(api_client, org) -> None:
    api_client.force_login(org.memberships.get(role="owner").user)


def _menu_with_item(org):
    menu = Menu.objects.create(
        organization=org,
        name="Menü",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(
        menu=menu, name="Kategori", slug="kategori", is_active=True
    )
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Ürün",
        price=Decimal("10.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )
    return menu, item


def _assert_common_envelope(response, feature: str) -> None:
    """The contract every feature guard owes the client."""
    assert response.status_code == 403, response.content
    body = response.json()
    assert set(body) >= {"error"}, body
    assert set(body["error"]) >= {"code", "message", "feature", "feature_label"}, body
    assert body["error"]["code"] == "billing.feature_disabled"
    assert body["error"]["feature"] == feature
    assert body["error"]["message"], "the operator gets a Turkish sentence, not a flag name"
    # The message names the module in Turkish, never the raw flag.
    assert feature not in body["error"]["message"]
    # The label travels with the answer, so the client keeps no second copy
    # of the flag names.
    assert body["error"]["feature_label"], body
    assert feature != body["error"]["feature_label"]
    assert "meta" in body


# --------------------------------------------------------------- the guards


def test_the_kitchen_board_uses_the_common_envelope(api_client, org_a):
    _basic(org_a)
    _login(api_client, org_a)

    response = api_client.get("/api/v1/admin/kitchen/board")

    _assert_common_envelope(response, "orders_enabled")


def test_the_order_list_uses_the_common_envelope(api_client, org_a):
    _basic(org_a)
    _login(api_client, org_a)

    response = api_client.get("/api/v1/admin/orders/")

    _assert_common_envelope(response, "orders_enabled")


def test_the_ai_translate_guard_uses_the_common_envelope(api_client, org_a):
    _basic(org_a)
    _login(api_client, org_a)
    _, item = _menu_with_item(org_a)

    response = api_client.post(
        f"/api/v1/admin/translate/menu-item/{item.id}/",
        {"target_locale": "en"},
        content_type="application/json",
    )

    _assert_common_envelope(response, "ai_translate_enabled")


def test_the_pdf_import_guard_uses_the_common_envelope(api_client, org_a):
    _basic(org_a)
    _login(api_client, org_a)

    # The upload view checks the flag before it looks at the file, so an
    # empty post is enough to reach the guard.
    response = api_client.post("/api/v1/admin/pdf-import/upload/")

    _assert_common_envelope(response, "ai_pdf_import_enabled")


def test_the_payment_guard_uses_the_common_envelope(api_client, basic_org):
    """The payment guard used to answer in a shape of its own."""
    _basic(basic_org)
    menu, item = _menu_with_item(basic_org)
    order = Order.objects.create(
        organization=basic_org,
        menu=menu,
        order_number="OZ-20260101-001",
        customer_name="X",
        customer_phone="+90 555 000 0000",
        total_amount=Decimal("10.00"),
        currency="TRY",
        status="pending",
    )
    OrderItem.objects.create(
        order=order, menu_item=item, name=item.name, price=item.price, quantity=1
    )

    response = api_client.post(
        f"/api/v1/payment/public/orders/{order.order_number}/pay/"
    )

    _assert_common_envelope(response, "payments_enabled")


def test_the_customer_accounts_guard_uses_the_common_envelope(api_client, basic_org):
    _basic(basic_org)

    response = api_client.post(
        f"/api/v1/account/auth/request-link?organization={basic_org.slug}",
        data={"email": "x@example.com"},
        format="json",
    )

    _assert_common_envelope(response, "customer_accounts_enabled")


def test_the_helper_answers_the_same_way_without_a_request():
    """A service-layer caller (no request) still gets the same body."""
    from apps.billing.errors import FeatureDisabled
    from apps.billing.responses import feature_disabled_response

    response = feature_disabled_response(
        FeatureDisabled(message="'Sipariş + mutfak' özelliği planınızda kapalı.",
                        feature="orders_enabled")
    )

    assert response.status_code == 403
    body = response.data
    assert body["error"]["code"] == "billing.feature_disabled"
    assert body["error"]["feature"] == "orders_enabled"
    assert body["meta"]["request_id"] == ""
