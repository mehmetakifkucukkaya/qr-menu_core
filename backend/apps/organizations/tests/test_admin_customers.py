"""The agency's "Müşteriler" screen: the Organization list and detail page of the
Django admin (SPEC_PILOT_READINESS 4.3) - who the customers are, on which plan,
whether they are alive, and what they use."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib import admin
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import Membership
from apps.billing.models import PlanSettings, TenantUsageCounter
from apps.menu.models import MenuCategory, MenuItem
from apps.onboarding.provisioning import provision_tenant
from apps.orders.models import Order
from apps.organizations.admin import OrganizationAdminForm
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db

LIST = "admin:organizations_organization_changelist"


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


def _order(org, number, days_ago):
    order = Order.objects.create(
        organization=org, order_number=number, customer_name="Ali", customer_phone="5550000000",
        total_amount=Decimal("85.00"),
    )
    Order.objects.filter(pk=order.pk).update(placed_at=timezone.now() - timedelta(days=days_ago))
    return order


def _items(org, count):
    menu = org.menus.get()
    category = MenuCategory.objects.create(menu=menu, name="Kahve", slug="kahve", sort_order=0, is_active=True)
    for i in range(count):
        MenuItem.objects.create(
            menu=menu, category=category, name=f"Ürün {i}", price=Decimal("50.00"), currency="TRY",
            sort_order=i, is_active=True, is_available=True,
        )


@pytest.fixture
def customers():
    pilot = provision_tenant(
        name="Pilot Kafe", slug="pilot-kafe", owner_email="owner@pilot.test",
        plan="pro", modules=["orders"],
    ).organization
    _items(pilot, 3)
    _order(pilot, "PK-1", days_ago=2)
    _order(pilot, "PK-2", days_ago=10)
    _order(pilot, "PK-OLD", days_ago=45)

    trial = provision_tenant(
        name="Deneme Lokanta", slug="deneme-lokanta", owner_email="owner@deneme.test",
        plan="basic", trial_days=5,
    ).organization

    suspended = provision_tenant(
        name="Askıda Büfe", slug="askida-bufe", owner_email="owner@askida.test",
    ).organization
    Organization.objects.filter(pk=suspended.pk).update(is_active=False)

    bare = Organization.objects.create(name="Elle Açılmış", slug="elle-acilmis", supported_locales=["tr"])
    return {"pilot": pilot, "trial": trial, "suspended": suspended, "bare": bare}


def _model_admin():
    return admin.site._registry[Organization]


def _row(agency_client, slug, **params):
    cl = agency_client.get(reverse(LIST), params).context["cl"]
    return next(o for o in cl.result_list if o.slug == slug)


# ------------------------------------------------------------------ columns


def test_the_list_describes_each_customer(agency, customers):
    ma = _model_admin()
    pilot = _row(agency, "pilot-kafe")
    assert ma.plan_label(pilot) == "QR Menü Pro"
    assert ma.owner_email(pilot) == "owner@pilot.test"
    assert ma.status(pilot) == "Aktif"
    assert ma.item_total(pilot) == 3
    assert ma.trial_label(pilot) == "—"

    trial = _row(agency, "deneme-lokanta")
    assert ma.plan_label(trial) == "Restoran Ops"
    assert ma.trial_label(trial) == "5 gün kaldı"

    assert ma.status(_row(agency, "askida-bufe")) == "Askıda"

    bare = _row(agency, "elle-acilmis")
    assert "plan satırı yok" in ma.plan_label(bare)  # no PlanSettings row
    assert ma.owner_email(bare) == "—"


def test_a_finished_trial_says_so(agency, customers):
    PlanSettings.objects.filter(organization=customers["trial"]).update(
        trial_ends_at=timezone.now() - timedelta(days=1)
    )
    assert _model_admin().trial_label(_row(agency, "deneme-lokanta")) == "Bitti"


def test_orders_are_counted_for_the_last_thirty_days_and_the_latest_is_shown(agency, customers):
    ma = _model_admin()
    pilot = _row(agency, "pilot-kafe")
    assert pilot.orders_30d == 2  # the 45-day-old one is out
    assert ma.last_order(pilot) is not None
    assert ma.orders_30d(_row(agency, "deneme-lokanta")) == 0
    assert ma.last_order(_row(agency, "deneme-lokanta")) == "—"


def test_the_list_does_not_query_per_row(agency, customers):
    with CaptureQueriesContext(connection) as few:
        assert agency.get(reverse(LIST)).status_code == 200
    for i in range(5):
        provision_tenant(name=f"Ek {i}", slug=f"ek-{i}", owner_email=f"ek{i}@x.test")
    with CaptureQueriesContext(connection) as many:
        assert agency.get(reverse(LIST)).status_code == 200
    assert len(many) <= len(few) + 1


# ------------------------------------------------------------------ filters and search


def _slugs(agency, **params):
    cl = agency.get(reverse(LIST), params).context["cl"]
    return {o.slug for o in cl.result_list}


def test_filter_by_plan(agency, customers):
    assert _slugs(agency, plan="pro") == {"pilot-kafe"}
    assert _slugs(agency, plan="none") == {"elle-acilmis"}
    assert "pilot-kafe" not in _slugs(agency, plan="basic")


def test_filter_suspended_and_active(agency, customers):
    assert _slugs(agency, durum="askida") == {"askida-bufe"}
    assert "askida-bufe" not in _slugs(agency, durum="aktif")


def test_filter_trials(agency, customers):
    assert _slugs(agency, deneme="soon") == {"deneme-lokanta"}
    assert _slugs(agency, deneme="running") == {"deneme-lokanta"}
    PlanSettings.objects.filter(organization=customers["trial"]).update(
        trial_ends_at=timezone.now() - timedelta(days=1)
    )
    assert _slugs(agency, deneme="ended") == {"deneme-lokanta"}
    assert _slugs(agency, deneme="soon") == set()


def test_filter_by_module(agency, customers):
    # Pro + the orders module, and the trial customer (full OPS features).
    assert _slugs(agency, modul="orders") == {"pilot-kafe", "deneme-lokanta"}
    assert _slugs(agency, modul="loyalty") == {"deneme-lokanta"}


def test_search_by_name_slug_and_owner_email(agency, customers):
    assert _slugs(agency, q="Pilot") == {"pilot-kafe"}
    assert _slugs(agency, q="deneme-lokanta") == {"deneme-lokanta"}
    assert _slugs(agency, q="owner@askida.test") == {"askida-bufe"}


def test_other_screens_can_still_pick_a_customer_by_name(agency, customers):
    """The Order form's organization picker is an autocomplete over this admin."""
    response = agency.get(
        reverse("admin:autocomplete"),
        {"term": "pilot", "app_label": "orders", "model_name": "order", "field_name": "organization"},
    )
    assert response.status_code == 200
    assert [r["text"] for r in response.json()["results"]] == ["Pilot Kafe (pilot-kafe)"]


# ------------------------------------------------------------------ detail page


def test_the_detail_page_shows_team_plan_usage_and_branches(agency, customers):
    pilot = customers["pilot"]
    TenantUsageCounter.objects.create(
        organization=pilot, period_year=timezone.now().year, period_month=timezone.now().month,
        views=120, scans=30,
    )
    response = agency.get(reverse("admin:organizations_organization_change", args=[pilot.pk]))
    html = response.content.decode()

    assert response.status_code == 200
    assert "owner@pilot.test" in html                       # the membership inline
    assert "Merkez" in html                                  # the branch inline
    assert "QR Menü Pro" in html                             # plan summary
    assert reverse("admin:billing_plansettings_change", args=[pilot.plan_settings.pk]) in html
    assert "120" in html and "30" in html                    # this month's usage
    assert 'type="checkbox"' in html and 'name="supported_locales"' in html
    assert '<textarea name="supported_locales"' not in html  # not raw JSON


def test_a_customer_without_a_plan_row_still_opens(agency, customers):
    response = agency.get(
        reverse("admin:organizations_organization_change", args=[customers["bare"].pk])
    )
    assert response.status_code == 200
    assert "plan satırı yok" in response.content.decode()
    assert not PlanSettings.objects.filter(organization=customers["bare"]).exists()  # a GET writes nothing


def _post_data(response):
    """Build the POST body an admin change page would send (its initial values)."""
    data = {}
    form = response.context["adminform"].form
    for name in form.fields:
        value = form[name].value()
        if value in (None, "") or hasattr(value, "url"):
            continue
        data[name] = value
    for inline in response.context["inline_admin_formsets"]:
        formset = inline.formset
        for field in formset.management_form:
            data[field.html_name] = field.value()
        for sub in formset.forms:
            for name in sub.fields:
                value = sub[name].value()
                if value not in (None, "") and not hasattr(value, "url"):
                    data[sub.add_prefix(name)] = value
    return data


def test_the_agency_can_save_a_customer_and_the_slug_stays_put(agency, customers):
    pilot = customers["pilot"]
    url = reverse("admin:organizations_organization_change", args=[pilot.pk])
    data = _post_data(agency.get(url))
    data.update({"name": "Pilot Kafe & Bistro", "phone": "0212 000 00 00", "slug": "degisti"})

    response = agency.post(url, data)

    assert response.status_code == 302, response.content.decode()[:2000]
    pilot.refresh_from_db()
    assert (pilot.name, pilot.phone) == ("Pilot Kafe & Bistro", "0212 000 00 00")
    assert pilot.slug == "pilot-kafe"  # printed QR codes depend on it


def test_languages_are_chosen_not_typed():
    org = Organization(name="X", slug="x", default_locale="tr", supported_locales=["tr"])
    ok = OrganizationAdminForm(
        data={"name": "X", "slug": "x", "default_locale": "en", "supported_locales": ["tr", "en"],
              "currency": "TRY", "is_active": "on"},
        instance=org,
    )
    assert ok.is_valid(), ok.errors
    assert ok.cleaned_data["supported_locales"] == ["tr", "en"]

    bad = OrganizationAdminForm(
        data={"name": "X", "slug": "x", "default_locale": "en", "supported_locales": ["tr"],
              "currency": "TRY", "is_active": "on"},
        instance=org,
    )
    assert not bad.is_valid()
    assert "supported_locales" in bad.errors


def test_team_membership_rows_are_edited_on_the_customer_page(agency, customers):
    pilot = customers["pilot"]
    member = Membership.objects.get(organization=pilot)
    url = reverse("admin:organizations_organization_change", args=[pilot.pk])
    data = _post_data(agency.get(url))
    data[f"memberships-0-is_active"] = ""  # unchecked

    assert agency.post(url, data).status_code == 302
    member.refresh_from_db()
    assert member.is_active is False
