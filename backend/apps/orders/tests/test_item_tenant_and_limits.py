"""Order creation only accepts the business's own items, and bounded carts
(ANALYSIS_1 F-10; SPEC_PILOT_READINESS §3.5)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.billing.constants import OPS, default_features
from apps.billing.models import PlanSettings
from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.orders import services
from apps.orders.models import Order

pytestmark = pytest.mark.django_db


def _item_for(org, name="Başkasının ürünü", price="1.00") -> MenuItem:
    menu = Menu.objects.create(
        organization=org,
        name=f"{org.name} menüsü",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Kategori", is_active=True)
    return MenuItem.objects.create(
        menu=menu,
        category=category,
        name=name,
        price=Decimal(price),
        currency="TRY",
        is_active=True,
        is_available=True,
    )


def _enable_orders(org) -> None:
    PlanSettings.objects.update_or_create(
        organization=org,
        defaults={"active_plan": OPS, **default_features(OPS)},
    )


def test_service_rejects_an_item_that_belongs_to_another_business(org_a, org_b, item_a):
    foreign = _item_for(org_b)
    with pytest.raises(ValidationError, match="Ürün bulunamadı"):
        services.create_order(
            organization=org_a,
            items_data=[
                {"menu_item_id": item_a.id, "quantity": 1},
                {"menu_item_id": foreign.id, "quantity": 1},
            ],
            customer_name="Mehmet",
            customer_phone="+905320000000",
        )
    assert Order.objects.count() == 0


def test_service_still_accepts_the_businesss_own_items(org_a, item_a):
    order = services.create_order(
        organization=org_a,
        items_data=[{"menu_item_id": item_a.id, "quantity": 2}],
        customer_name="Mehmet",
        customer_phone="+905320000000",
    )
    assert order.total_amount == Decimal("90.00")


def _payload(org, lines):
    return {
        "organization_slug": org.slug,
        "customer_name": "Mehmet",
        "customer_phone": "+905320000000",
        "items": lines,
    }


def test_public_endpoint_refuses_another_businesss_item(api_client, org_a, org_b, item_a):
    _enable_orders(org_a)
    foreign = _item_for(org_b, price="0.01")
    response = api_client.post(
        "/api/v1/public/orders",
        _payload(org_a, [{"menu_item_id": foreign.id, "quantity": 1}]),
        format="json",
    )
    assert response.status_code == 400, response.content
    assert Order.objects.count() == 0


def test_public_endpoint_caps_the_number_of_lines(api_client, org_a, item_a):
    _enable_orders(org_a)
    lines = [{"menu_item_id": item_a.id, "quantity": 1}] * 51
    response = api_client.post("/api/v1/public/orders", _payload(org_a, lines), format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "order.invalid_payload"
    assert "items" in response.json()["error"]["details"]
    assert Order.objects.count() == 0


def test_public_endpoint_accepts_a_cart_at_the_cap(api_client, org_a, item_a):
    _enable_orders(org_a)
    lines = [{"menu_item_id": item_a.id, "quantity": 1}] * 50
    response = api_client.post("/api/v1/public/orders", _payload(org_a, lines), format="json")
    assert response.status_code == 201, response.content
