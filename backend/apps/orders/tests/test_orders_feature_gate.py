"""The kitchen and the order pages stay closed when the tenant's plan has no
"Sipariş + mutfak" module (SPEC_PILOT_READINESS §6 — Dilim 4).

The ``orders_enabled`` flag was only checked where a *customer* places an
order (the public endpoint). The admin surfaces that actually run a kitchen —
the board, the ticket feed, the order list, the order detail and the status
change — had no guard at all. So a BASIC tenant (whose plan has
``orders_enabled = False``) could open /admin/kitchen and /admin/orders and
work a flow the plan does not include.

The guard answers 403 with ``billing.feature_disabled`` so the client can say
"this is not your plan" instead of "your session ended".
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.billing.constants import BASIC, ORDERS as ORDERS_PLAN, default_features
from apps.billing.models import PlanSettings
from apps.orders.models import Order, OrderItem

pytestmark = pytest.mark.django_db

BOARD_URL = "/api/v1/admin/kitchen/board"
TICKETS_URL = "/api/v1/admin/kitchen/tickets"
ORDERS_URL = "/api/v1/admin/orders/"
ORDER_DETAIL_URL = "/api/v1/admin/orders/{pk}"
ORDER_STATUS_URL = "/api/v1/admin/orders/{pk}/status"


def _plan(org, plan) -> None:
    """Put the tenant on ``plan`` with that plan's default feature flags."""
    PlanSettings.objects.update_or_create(
        organization=org,
        defaults={"active_plan": plan, **default_features(plan)},
    )


def _login(api_client, org) -> None:
    api_client.force_login(org.memberships.get(role="owner").user)


def _order(org) -> Order:
    order = Order.objects.create(
        organization=org,
        order_number="FG-20260101-001",
        customer_name="Ali",
        customer_phone="+905321112233",
        total_amount=Decimal("45.00"),
        currency="TRY",
        status="pending",
    )
    OrderItem.objects.create(
        order=order,
        name="Türk Kahvesi",
        price=Decimal("45.00"),
        quantity=1,
    )
    return order


def _assert_closed(response) -> None:
    """The answer says "not in your plan", not "you are not allowed"."""
    assert response.status_code == 403, response.content
    body = response.json()
    assert body["error"]["code"] == "billing.feature_disabled"
    assert body["error"]["feature"] == "orders_enabled"
    assert body["error"]["message"]


# ------------------------------------------------------------------ closed


def test_the_kitchen_board_is_closed_without_the_orders_module(api_client, org_a):
    _plan(org_a, BASIC)
    _login(api_client, org_a)

    response = api_client.get(BOARD_URL)

    _assert_closed(response)


def test_the_ticket_feed_is_closed_without_the_orders_module(api_client, org_a):
    _plan(org_a, BASIC)
    _login(api_client, org_a)

    response = api_client.get(TICKETS_URL)

    _assert_closed(response)


def test_the_order_list_is_closed_without_the_orders_module(api_client, org_a):
    _plan(org_a, BASIC)
    _login(api_client, org_a)

    response = api_client.get(ORDERS_URL)

    _assert_closed(response)


def test_the_order_detail_is_closed_without_the_orders_module(api_client, org_a):
    _plan(org_a, BASIC)
    _login(api_client, org_a)
    order = _order(org_a)

    response = api_client.get(ORDER_DETAIL_URL.format(pk=order.pk))

    _assert_closed(response)


def test_the_status_change_is_closed_without_the_orders_module(api_client, org_a):
    _plan(org_a, BASIC)
    _login(api_client, org_a)
    order = _order(org_a)

    response = api_client.post(
        ORDER_STATUS_URL.format(pk=order.pk),
        {"status": "preparing"},
        content_type="application/json",
    )

    _assert_closed(response)
    order.refresh_from_db()
    assert order.status == "pending", "the order must not move"


# ------------------------------------------------------------------- open


def test_the_kitchen_board_opens_when_the_plan_has_the_orders_module(
    api_client, org_a
):
    _plan(org_a, ORDERS_PLAN)
    _login(api_client, org_a)
    _order(org_a)

    response = api_client.get(BOARD_URL)

    assert response.status_code == 200, response.content
    assert response.json()["data"]["counts"]["new"] == 1


def test_the_order_list_opens_when_the_plan_has_the_orders_module(api_client, org_a):
    _plan(org_a, ORDERS_PLAN)
    _login(api_client, org_a)
    _order(org_a)

    response = api_client.get(ORDERS_URL)

    assert response.status_code == 200, response.content


def test_the_status_change_still_moves_the_order_when_the_plan_allows_it(
    api_client, org_a
):
    _plan(org_a, ORDERS_PLAN)
    _login(api_client, org_a)
    order = _order(org_a)

    response = api_client.post(
        ORDER_STATUS_URL.format(pk=order.pk),
        {"status": "preparing"},
        content_type="application/json",
    )

    assert response.status_code == 200, response.content
    order.refresh_from_db()
    assert order.status == "preparing"


# ------------------------------------------------------------------ audit


def test_the_rejection_is_audited(api_client, org_a):
    """A closed door that leaves no trace is a bug, not a feature."""
    from apps.audit.models import AuditEvent

    _plan(org_a, BASIC)
    _login(api_client, org_a)

    api_client.get(BOARD_URL)

    assert AuditEvent.objects.filter(action="feature_disabled_access").exists()
