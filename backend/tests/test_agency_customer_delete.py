"""Deleting a customer in the agency panel (SPEC_PILOT_READINESS 4.3).

The panel protects some rows on their own (the plan, uploaded media, view events:
evidence, not a workbench) - but they must still go away WITH their customer.
The live pass found the customer's delete page answering "İşletme silinemiyor":
Django asks the admin of every row that would be deleted along, and the
protective ones said no. (The "Siteyi göster" link of the header pointed at the
backend's empty root and goes away too.)
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest
from django.contrib import admin
from django.db import connection
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.analytics.models import MenuViewEvent
from apps.billing.models import PlanSettings, TenantUsageCounter
from apps.branches.models import Branch
from apps.media.models import MediaAsset
from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.onboarding.provisioning import provision_tenant
from apps.orders.models import Order, OrderItem
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


@pytest.fixture
def customer():
    """A customer with everything the panel protects on its own or cascades (but no order)."""
    org = provision_tenant(
        name="Silinecek Kafe", slug="silinecek", owner_email="sahip@silinecek.test",
        plan="pro", modules=["orders"],
    ).organization
    menu = org.menus.get()
    category = MenuCategory.objects.create(menu=menu, name="Kahve", slug="kahve", sort_order=0, is_active=True)
    item = MenuItem.objects.create(
        menu=menu, category=category, name="Latte", price=Decimal("85.00"), currency="TRY",
        sort_order=0, is_active=True, is_available=True,
    )
    MediaAsset.objects.create(
        organization=org, kind="image", original_filename="latte.jpg", content_type="image/jpeg",
        size_bytes=2048, storage_key="tenants/silinecek/latte.jpg",
        public_url="http://localhost:3000/media/latte.jpg",
    )
    MenuViewEvent.objects.create(
        organization=org, event_type="menu_view", locale="tr", path="/m/silinecek",
        user_agent_hash="a" * 64, ip_hash="b" * 64,
    )
    TenantUsageCounter.objects.create(organization=org, period_year=2026, period_month=10, views=3)
    return org


@pytest.fixture
def customer_with_an_order(customer):
    order = Order.objects.create(
        organization=customer, order_number="SK-1", customer_name="Ali", customer_phone="5550000000",
        total_amount=Decimal("85.00"),
    )
    OrderItem.objects.create(
        order=order, menu_item=MenuItem.objects.get(menu__organization=customer), name="Latte",
        price=Decimal("85.00"), quantity=1,
    )
    return customer


def _delete_url(org):
    return reverse("admin:organizations_organization_delete", args=[org.pk])


def test_the_delete_page_of_a_customer_is_not_blocked(agency, customer):
    response = agency.get(_delete_url(customer))
    html = response.content.decode()

    assert response.status_code == 200
    assert "silinemiyor" not in html
    for related in ("Plan Ayarları", "Medya Varlığı", "Menü Görüntülenme Olayı"):
        assert related in html, related


def test_confirming_removes_the_customer_with_its_rows_and_keeps_the_trail(agency, admin_user, customer):
    org_id = customer.pk

    response = agency.post(_delete_url(customer), {"post": "yes"})

    assert response.status_code == 302, response.content.decode()[:800]
    connection.check_constraints()  # nothing may point at the deleted rows
    assert not Organization.objects.filter(pk=org_id).exists()
    for model in (PlanSettings, MediaAsset, MenuViewEvent, TenantUsageCounter, Branch, Menu):
        assert not model.objects.filter(organization_id=org_id).exists(), model.__name__
    assert not MenuItem.objects.filter(menu__organization_id=org_id).exists()

    # The agency's trail stays, under the business' name.
    trail = AuditEvent.objects.filter(
        organization__isnull=True, organization_label="Silinecek Kafe (silinecek)"
    )
    assert trail.filter(action="deleted", target_type="organization", actor=admin_user).exists()
    assert trail.filter(action="tenant_created").exists()


def test_a_customer_with_orders_still_cannot_be_deleted(agency, customer_with_an_order):
    """Orders are business records (``Order.organization`` is PROTECT): suspend, don't delete."""
    url = _delete_url(customer_with_an_order)

    assert "korunan" in agency.get(url).content.decode()
    assert agency.post(url, {"post": "yes"}).status_code == 200  # the explanation again, nothing deleted

    assert Organization.objects.filter(pk=customer_with_an_order.pk).exists()
    assert Order.objects.filter(organization=customer_with_an_order).exists()


@pytest.mark.parametrize(
    "url_name, lifted",
    [
        ("organizations_organization_delete", True),
        ("billing_plansettings_delete", False),
        ("billing_plansettings_changelist", False),
        ("media_mediaasset_delete", False),
        ("analytics_menuviewevent_changelist", False),
    ],
)
def test_the_protection_is_lifted_on_the_customers_delete_page_only(rf, admin_user, url_name, lifted):
    request = rf.get("/")
    request.user = admin_user
    request.resolver_match = SimpleNamespace(url_name=url_name)
    for model in (PlanSettings, MediaAsset, MenuViewEvent):
        assert admin.site._registry[model].has_delete_permission(request) is lifted, model.__name__


def test_the_header_has_no_link_to_a_site_that_is_not_there(agency):
    assert "Siteyi göster" not in agency.get(reverse("admin:index")).content.decode()
