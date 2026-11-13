"""Audit events outlive the business they describe (SPEC_PILOT_READINESS 4.3).

The agency's trail - who opened, suspended or changed which customer - must not
vanish when a customer is deleted in the Django admin. Deleting a business used
to fail outright: its own "deleted" event pointed at the row that had just gone
(FOREIGN KEY constraint failed).
"""

from __future__ import annotations

import importlib
from decimal import Decimal

import pytest
from django.apps import apps as django_apps
from django.db import connection

from apps.audit.models import AuditEvent
from apps.audit.services import record_event
from apps.branches.models import Branch
from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.organizations.models import Organization
from apps.theme.models import ThemeConfig


def _note(org, **overrides):
    values = dict(
        organization=org,
        action="updated",
        target_type="organization",
        target_id=org.id,
        target_repr="note",
    )
    values.update(overrides)
    return record_event(**values)


def _content(org):
    menu = Menu.objects.create(
        organization=org, name="Ana Menü", slug="ana-menu", default_locale="tr",
        supported_locales=["tr"], is_active=True,
    )
    category = MenuCategory.objects.create(menu=menu, name="Kahve", slug="kahve", sort_order=0, is_active=True)
    MenuItem.objects.create(
        menu=menu, category=category, name="Latte", price=Decimal("85.00"), currency="TRY",
        sort_order=0, is_active=True, is_available=True,
    )
    Branch.objects.create(organization=org, name="Merkez", slug="merkez", is_active=True)
    ThemeConfig.objects.create(organization=org)
    return menu


@pytest.mark.django_db
def test_an_event_remembers_whose_it_was(org_a):
    assert _note(org_a).organization_label == "Cafe A (cafe-a)"


@pytest.mark.django_db
def test_an_event_can_be_kept_without_a_business():
    event = record_event(
        organization=None,
        organization_label="Eski Kafe (eski-kafe)",
        action="deleted",
        target_type="organization",
        target_id=7,
        target_repr="Eski Kafe (eski-kafe)",
    )
    event.refresh_from_db()
    assert event.organization_id is None
    assert event.organization_label == "Eski Kafe (eski-kafe)"


@pytest.mark.django_db(transaction=True)
def test_deleting_a_business_keeps_its_trail(org_a):
    _note(org_a)
    mine = AuditEvent.objects.filter(organization=org_a).count()
    assert mine >= 2  # the "created" signal event and the note

    org_a.delete()
    connection.check_constraints()  # a dangling reference would raise here

    orphans = AuditEvent.objects.filter(organization__isnull=True)
    assert orphans.count() >= mine
    assert set(orphans.values_list("organization_label", flat=True)) == {"Cafe A (cafe-a)"}
    gone = orphans.get(action="deleted", target_type="organization")
    assert gone.target_repr == "Cafe A (cafe-a)"


@pytest.mark.django_db(transaction=True)
def test_deleting_a_business_does_not_log_every_child(org_a):
    _content(org_a)
    Organization.objects.filter(pk=org_a.pk).delete()  # the queryset path (admin bulk delete)
    connection.check_constraints()

    deleted = AuditEvent.objects.filter(action="deleted")
    assert list(deleted.values_list("target_type", flat=True)) == ["organization"]


@pytest.mark.django_db
def test_deleting_a_menu_alone_is_still_logged(org_a):
    menu = _content(org_a)
    menu.delete()
    assert AuditEvent.objects.filter(organization=org_a, action="deleted", target_type="menu").exists()
    assert AuditEvent.objects.filter(organization=org_a, action="deleted", target_type="item").exists()


@pytest.mark.django_db
def test_the_migration_fills_the_labels_of_existing_events(org_a):
    event = _note(org_a)
    AuditEvent.objects.filter(pk=event.pk).update(organization_label="")
    migration = importlib.import_module("apps.audit.migrations.0010_auditevent_organization_label")

    migration.backfill_labels(django_apps, None)

    event.refresh_from_db()
    assert event.organization_label == "Cafe A (cafe-a)"
