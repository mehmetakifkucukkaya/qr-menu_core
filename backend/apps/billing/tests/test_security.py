"""Billing security tests — Sprint B1 (D-026).

6 tests covering tenant isolation + guard trip + audit:

* /admin/billing/plan/ returns 404 (or 200 with empty body) for a
  user with no active membership.
* Plan endpoint is tenant-scoped — user_a can only see org_a's plan.
* orders_enabled guard returns 403 when disabled (BASIC tier) on
  POST /api/v1/public/orders/.
* payments_enabled guard returns 403 on POST /public/orders/{n}/pay/.
* customer_accounts_enabled guard returns 403 on POST
  /api/v1/account/auth/request-link/?organization=<slug>.
* limit_exceeded_attempt audit row created when enforce_limit trips.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.audit.models import AuditEvent
from apps.billing.constants import BASIC, OPS
from apps.menu.models import Menu, MenuCategory

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Auth + tenant isolation
# ---------------------------------------------------------------------------


def test_endpoint_requires_org_member(make_plan_settings, organization_a, django_user_model):
    """A user with NO membership at all → endpoint blocks app-level data."""
    from apps.audit.models import AuditEvent

    make_plan_settings(organization_a, plan=OPS)
    # Bare owner user with no Membership row.
    orphan = django_user_model.objects.create_user(
        email="orphan@example.com", password="x", role="owner"
    )
    client = APIClient()
    client.force_authenticate(user=orphan)
    res = client.get("/api/v1/admin/billing/plan/")
    assert res.status_code in (403, 404), res.content


def test_cross_org_plan_isolates_tenants(
    make_plan_settings, organization_a, organization_b, user_b
):
    """user_b in org_b cannot see org_a's plan row.

    The plan view resolves by first-active-membership, so user_b sees
    only org_b's settings. org_a's settings are not exposed in the
    response body.
    """
    _make = make_plan_settings
    _make(organization_a, plan=OPS)
    _make(organization_b, plan=BASIC)
    client = APIClient()
    client.force_authenticate(user=user_b)
    res = client.get("/api/v1/admin/billing/plan/")
    assert res.status_code == 200, res.content
    body = res.json()["data"]
    # user_b's tenant = org_b → BASIC plan.
    assert body["active_plan"] == BASIC
    assert body["organization"] == organization_b.id
    # And org_a's OPS settings are not leaked.
    assert body["organization"] != organization_a.id


# ---------------------------------------------------------------------------
# Endpoint guards — orders / payment / customer accounts
# ---------------------------------------------------------------------------


def test_guard_returns_403_when_feature_disabled_orders(basic_org):
    """BASIC tier → POST /public/orders → 403 with feature=orders_enabled.

    We need to send a serializer-valid body so the guard fires before
    the 400 ``order.invalid_payload`` short-circuit.
    """
    from apps.menu.models import Menu, MenuCategory, MenuItem

    menu = Menu.objects.create(
        organization=basic_org,
        slug="m-guard",
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat = MenuCategory.objects.create(menu=menu, slug="c1", name="C", is_active=True)
    item = MenuItem.objects.create(
        menu=menu, category=cat, name="I", price=10, is_active=True
    )

    client = APIClient()
    res = client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": basic_org.slug,
            "items": [{"menu_item_id": item.id, "quantity": 1}],
            "customer_name": "Test",
            "customer_phone": "+90 555 111 22 33",
        },
        format="json",
    )
    assert res.status_code == 403, res.content
    body = res.json()
    assert body["error"]["code"] == "billing.feature_disabled"
    assert body["error"]["feature"] == "orders_enabled"


def test_guard_returns_403_when_feature_disabled_payments(
    make_plan_settings, organization_a, user_a, basic_org
):
    """BASIC tier → POST /public/orders/{n}/pay/ → 403.

    We need a pending order in basic_org; we create one manually
    using the order service so we don't depend on the orders_enabled
    guard tripping first.
    """
    from apps.menu.models import Menu, MenuCategory, MenuItem
    from apps.orders.services import create_order

    make_plan_settings(basic_org, plan=BASIC)

    menu = Menu.objects.create(
        organization=basic_org,
        slug="m-pay-test",
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat = MenuCategory.objects.create(menu=menu, slug="c1", name="C", is_active=True)
    item = MenuItem.objects.create(
        menu=menu, category=cat, name="I", price=10, is_active=True
    )

    # Bypass the orders guard by creating the order directly via the
    # service. We pass the validated payload shape the service expects
    # (``menu_item_id`` + ``quantity`` per line).
    order = create_order(
        organization=basic_org,
        items_data=[{"menu_item_id": item.id, "quantity": 1}],
        customer_name="X",
        customer_phone="+90 555 000 0000",
    )

    client = APIClient()
    res = client.post(f"/api/v1/payment/public/orders/{order.order_number}/pay/")
    assert res.status_code == 403, res.content
    body = res.json()
    assert body.get("code") == "billing.feature_disabled"
    assert body.get("feature") == "payments_enabled"


def test_guard_403_customer_accounts_disabled(basic_org):
    """BASIC tenant → POST /account/auth/request-link → 403."""
    client = APIClient()
    res = client.post(
        f"/api/v1/account/auth/request-link?organization={basic_org.slug}",
        data={"email": "x@example.com"},
        format="json",
    )
    assert res.status_code == 403, res.content
    body = res.json()
    assert body["error"]["code"] == "billing.feature_disabled"
    assert body["error"]["feature"] == "customer_accounts_enabled"


# ---------------------------------------------------------------------------
# Audit trip
# ---------------------------------------------------------------------------


def test_guard_audit_event_recorded(basic_org):
    """The orders_enabled guard records a ``feature_disabled_access`` audit row."""
    from apps.menu.models import Menu, MenuCategory, MenuItem

    menu = Menu.objects.create(
        organization=basic_org,
        slug="m-audit",
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    cat = MenuCategory.objects.create(menu=menu, slug="c1", name="C", is_active=True)
    item = MenuItem.objects.create(
        menu=menu, category=cat, name="I", price=10, is_active=True
    )

    client = APIClient()
    res = client.post(
        "/api/v1/public/orders",
        data={
            "organization_slug": basic_org.slug,
            "items": [{"menu_item_id": item.id, "quantity": 1}],
            "customer_name": "T",
            "customer_phone": "+90 555 111 22 33",
        },
        format="json",
    )
    assert res.status_code == 403

    audit = AuditEvent.objects.filter(
        organization=basic_org,
        action="feature_disabled_access",
        target_type="plan_settings",
    )
    assert audit.count() == 1
    payload = audit.first().payload
    assert payload["feature"] == "orders_enabled"