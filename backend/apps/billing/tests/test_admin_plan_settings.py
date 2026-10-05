"""The plan page of the agency panel (SPEC_PILOT_READINESS 4.3): a change made
in the Django admin goes through ``update_plan_settings`` - the flags follow the
plan, a plan decision ends a trial, and every change is audited with the agency
user as the actor."""

from __future__ import annotations

import pytest
from django.urls import reverse

from apps.audit.models import AuditEvent
from apps.billing.constants import FEATURE_FIELDS, default_features
from apps.billing.models import PlanSettings
from apps.onboarding.provisioning import provision_tenant

pytestmark = pytest.mark.django_db


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


def _customer(**kwargs):
    values = dict(name="Pilot Kafe", slug="pilot-kafe", owner_email="owner@pilot.test", plan="pro")
    values.update(kwargs)
    result = provision_tenant(**values)
    return PlanSettings.objects.get(organization=result.organization)


def _change_url(ps):
    return reverse("admin:billing_plansettings_change", args=[ps.pk])


def _post(ps, **changes):
    """The body the change page would send for `ps`, with `changes` applied
    (an unticked box is simply absent)."""
    values = {"active_plan": ps.active_plan, "billing_notes": ps.billing_notes}
    values.update({flag: getattr(ps, flag) for flag in FEATURE_FIELDS})
    values.update(changes)
    return {key: value for key, value in values.items() if value is not False}


def _last_event(ps):
    return AuditEvent.objects.filter(
        organization=ps.organization, action="plan_changed"
    ).latest("id")


def test_ticking_a_module_is_applied_and_audited(agency, admin_user):
    ps = _customer()
    assert not ps.orders_enabled

    response = agency.post(_change_url(ps), _post(ps, cart_enabled=True, orders_enabled=True))

    assert response.status_code == 302, response.content.decode()[:1500]
    ps.refresh_from_db()
    assert ps.active_plan == "pro" and ps.cart_enabled and ps.orders_enabled
    assert not ps.loyalty_enabled
    event = _last_event(ps)
    assert event.actor == admin_user
    assert event.payload["before"]["features"]["orders_enabled"] is False
    assert event.payload["after"]["features"]["orders_enabled"] is True


def test_changing_the_plan_follows_the_plan_and_ends_the_trial(agency):
    ps = _customer(plan="basic", trial_days=14)
    assert ps.active_plan == "ops" and ps.trial_ends_at

    response = agency.post(_change_url(ps), _post(ps, active_plan="pro"))

    assert response.status_code == 302
    ps.refresh_from_db()
    assert ps.active_plan == "pro"
    assert ps.trial_ends_at is None and ps.trial_started_at is None
    assert {f: getattr(ps, f) for f in FEATURE_FIELDS} == default_features("pro")
    assert _last_event(ps).payload["after"]["active_plan"] == "pro"


def test_a_flag_ticked_together_with_the_plan_change_is_kept(agency):
    ps = _customer(plan="basic")

    agency.post(_change_url(ps), _post(ps, active_plan="pro", loyalty_enabled=True))

    ps.refresh_from_db()
    expected = {**default_features("pro"), "loyalty_enabled": True}
    assert {f: getattr(ps, f) for f in FEATURE_FIELDS} == expected


def test_a_save_without_changes_logs_nothing(agency):
    ps = _customer()
    before = AuditEvent.objects.filter(action="plan_changed").count()

    assert agency.post(_change_url(ps), _post(ps)).status_code == 302

    assert AuditEvent.objects.filter(action="plan_changed").count() == before


def test_the_page_is_turkish_and_the_customer_cannot_be_swapped(agency):
    ps = _customer()
    other = _customer(name="Başka", slug="baska", owner_email="o@baska.test")
    html = agency.get(_change_url(ps)).content.decode()
    for label in ("Paket", "Sipariş + mutfak", "Sadakat", "Deneme"):
        assert label in html, label

    agency.post(_change_url(ps), {**_post(ps), "organization": other.organization_id})
    ps.refresh_from_db()
    assert ps.organization.slug == "pilot-kafe"


def test_a_plan_can_be_added_for_a_customer_that_has_none(agency, admin_user, org_b):
    assert not PlanSettings.objects.filter(organization=org_b).exists()
    body = {"organization": org_b.pk, "active_plan": "basic", "billing_notes": ""}

    response = agency.post(reverse("admin:billing_plansettings_add"), body)

    assert response.status_code == 302, response.content.decode()[:1500]
    assert PlanSettings.objects.get(organization=org_b).active_plan == "basic"
    event = AuditEvent.objects.filter(organization=org_b, action="plan_changed").latest("id")
    assert event.actor == admin_user and event.payload["reason"] == "created_in_admin"


def test_plan_rows_are_not_deleted_here(agency):
    ps = _customer()
    assert agency.get(reverse("admin:billing_plansettings_delete", args=[ps.pk])).status_code == 403
    assert PlanSettings.objects.filter(pk=ps.pk).exists()
