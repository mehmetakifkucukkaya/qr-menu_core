"""Audit signal tests — Sprint 4C.

These tests verify the post_save / post_delete handlers on Menu,
MenuCategory and MenuItem translate field changes into the expected
AuditEvent rows.

We bypass the HTTP layer (use the ORM directly) so the signal layer
can be tested independently of the API. The middleware's actor / IP
plumbing is exercised in ``test_summary_endpoint_*``.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.audit.context import set_current_actor, set_current_ip
from apps.audit.models import AuditEvent
from apps.menu.models import Menu, MenuCategory, MenuItem

pytestmark = pytest.mark.django_db


def _actor_and_ip(user=None, ip="10.0.0.1"):
    set_current_actor(user)
    set_current_ip(ip)


def test_create_menu_emits_created_event(org_a):
    _actor_and_ip()
    menu = Menu.objects.create(
        organization=org_a,
        name="Yeni Menü",
        description="",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    event = AuditEvent.objects.filter(target_type="menu", target_id=menu.id).get()
    assert event.action == "created"
    assert event.payload.get("name") == "Yeni Menü"
    assert event.organization_id == org_a.id
    assert event.actor is None
    assert event.ip_address == "10.0.0.1"


def test_create_category_emits_created_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    event = AuditEvent.objects.filter(
        target_type="category", target_id=category.id
    ).get()
    assert event.action == "created"


def test_create_item_emits_created_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Türk Kahvesi",
        price=Decimal("75.00"),
        currency="TRY",
    )
    event = AuditEvent.objects.filter(target_type="item", target_id=item.id).get()
    assert event.action == "created"
    assert event.payload["price"] == "75.00"


def test_price_change_emits_price_changed_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Latte",
        price=Decimal("50.00"),
        currency="TRY",
    )
    AuditEvent.objects.all().delete()  # ignore the "created" row

    item.price = Decimal("55.00")
    item.save()

    event = AuditEvent.objects.filter(target_type="item", target_id=item.id).get()
    assert event.action == "price_changed"
    assert event.payload == {"old": "50.00", "new": "55.00"}


def test_deactivate_emits_deactivated_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Latte",
        price=Decimal("50.00"),
        currency="TRY",
        is_active=True,
    )
    AuditEvent.objects.all().delete()

    item.is_active = False
    item.save()

    event = AuditEvent.objects.filter(target_type="item", target_id=item.id).get()
    assert event.action == "deactivated"


def test_reactivate_emits_reactivated_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Latte",
        price=Decimal("50.00"),
        currency="TRY",
        is_active=False,
    )
    AuditEvent.objects.all().delete()

    item.is_active = True
    item.save()

    event = AuditEvent.objects.filter(target_type="item", target_id=item.id).get()
    assert event.action == "reactivated"


def test_post_delete_emits_deleted_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Latte",
        price=Decimal("50.00"),
        currency="TRY",
    )
    item_id = item.id
    AuditEvent.objects.all().delete()

    item.delete()

    event = AuditEvent.objects.filter(
        target_type="item", target_id=item_id, action="deleted"
    ).get()
    assert event.payload["name"] == "Latte"


def test_menu_publish_toggle_emits_published_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=False,
    )
    AuditEvent.objects.all().delete()

    menu.is_active = True
    menu.save()

    event = AuditEvent.objects.filter(target_type="menu", target_id=menu.id).get()
    assert event.action == "published"


def test_category_sort_order_change_emits_reordered_event(org_a):
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    AuditEvent.objects.all().delete()

    category.sort_order = 5
    category.save()

    event = AuditEvent.objects.filter(
        target_type="category", target_id=category.id
    ).get()
    assert event.action == "reordered"
    assert event.payload == {"old": 0, "new": 5, "fields": ["sort_order"]}


def test_audit_event_includes_actor_when_set(org_a):
    from django.contrib.auth import get_user_model

    user = get_user_model().objects.create_user(email="actor@example.com", password="x")
    _actor_and_ip(user=user, ip="192.168.1.42")

    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )

    event = AuditEvent.objects.filter(target_type="menu", target_id=menu.id).get()
    assert event.actor == user
    assert event.ip_address == "192.168.1.42"


def test_audit_event_payload_does_not_blow_up_on_unrelated_update(org_a):
    """Updating a non-tracked field still emits an ``updated`` row,
    not an exception, and lists the changed fields when relevant."""
    menu = Menu.objects.create(
        organization=org_a,
        name="M",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Cat", sort_order=0)
    item = MenuItem.objects.create(
        menu=menu,
        category=category,
        name="Latte",
        price=Decimal("50.00"),
        currency="TRY",
    )
    AuditEvent.objects.all().delete()

    item.is_available = False
    item.save()

    event = AuditEvent.objects.filter(target_type="item", target_id=item.id).get()
    assert event.action == "updated"
    assert "is_available" in event.payload.get("fields", [])
