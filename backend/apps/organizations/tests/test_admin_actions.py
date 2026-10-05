"""What the agency does to a customer from the Müşteriler list (SPEC_PILOT_READINESS 4.3):
suspend / reactivate, extend the trial, reissue the owner's password - each audited
with the signed-in agency user as the actor."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.messages import get_messages
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, MembershipRole, User
from apps.audit.models import AuditEvent
from apps.billing.models import PlanSettings
from apps.onboarding.provisioning import provision_tenant
from apps.organizations import services
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db

LIST = reverse("admin:organizations_organization_changelist")


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


@pytest.fixture
def pilot():
    return provision_tenant(
        name="Pilot Kafe", slug="pilot-kafe", owner_email="owner@pilot.test", plan="pro"
    )


@pytest.fixture
def trial():
    return provision_tenant(
        name="Deneme Lokanta", slug="deneme-lokanta", owner_email="owner@deneme.test", trial_days=3
    )


def _run(client, action, orgs, **extra):
    body = {"action": action, "_selected_action": [str(o.pk) for o in orgs], "index": "0", **extra}
    return client.post(LIST, body)


def _messages(response):
    return [str(m) for m in get_messages(response.wsgi_request)]


# ------------------------------------------------------------------ services


def test_suspending_and_reactivating_are_audited_once_each(pilot):
    org = pilot.organization
    AuditEvent.objects.all().delete()

    assert services.set_active(org, False) is True
    org.refresh_from_db()
    assert org.is_active is False
    assert list(AuditEvent.objects.values_list("action", flat=True)) == ["deactivated"]
    event = AuditEvent.objects.get()
    assert event.target_type == "organization" and event.organization == org

    assert services.set_active(org, False) is False  # nothing to do, nothing logged
    assert AuditEvent.objects.count() == 1

    assert services.set_active(org, True) is True
    assert AuditEvent.objects.filter(action="reactivated").count() == 1


def test_a_suspended_customer_cannot_sign_in_until_reactivated(pilot):
    client = APIClient()
    pilot.owner.must_change_password = False
    pilot.owner.set_password("Kendi-Sifrem-1!")
    pilot.owner.save()
    body = {"email": "owner@pilot.test", "password": "Kendi-Sifrem-1!"}

    services.set_active(pilot.organization, False)
    refused = client.post("/api/v1/auth/login", body, format="json")
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "tenant.suspended"

    services.set_active(pilot.organization, True)
    assert client.post("/api/v1/auth/login", body, format="json").status_code == 200


def test_the_owner_password_is_reissued(pilot):
    old = pilot.temporary_password
    pilot.owner.must_change_password = False
    pilot.owner.save()

    user, password = services.reset_owner_password(pilot.organization)

    user.refresh_from_db()
    assert user.email == "owner@pilot.test"
    assert len(password) == 10 and user.check_password(password)
    assert not user.check_password(old)
    assert user.must_change_password is True
    event = AuditEvent.objects.filter(action="updated", target_type="membership").latest("id")
    assert event.payload["change"] == "password_reset"
    assert password not in str(event.payload)


def test_a_customer_without_an_active_owner_cannot_have_a_password_reissued(pilot):
    Membership.objects.filter(organization=pilot.organization).update(is_active=False)
    with pytest.raises(ValueError):
        services.reset_owner_password(pilot.organization)


# ------------------------------------------------------------------ the list's actions


def test_the_actions_offered(agency, pilot, rf):
    choices = dict(agency.get(LIST).context["action_form"].fields["action"].choices)
    assert {"suspend", "reactivate", "extend_trial_7", "extend_trial_14", "extend_trial_30",
            "reset_owner_password"} <= set(choices)
    assert "delete_selected" not in choices  # a customer is not deleted in bulk


def test_suspending_asks_first_then_does_it_as_the_agency_user(agency, admin_user, pilot):
    org = pilot.organization

    asked = _run(agency, "suspend", [org])
    assert asked.status_code == 200
    assert "Evet, uygula" in asked.content.decode() and "Pilot Kafe" in asked.content.decode()
    org.refresh_from_db()
    assert org.is_active is True

    done = agency.post(
        LIST,
        {"action": "suspend", "_selected_action": [str(org.pk)], "confirm": "yes", "select_across": "0"},
        follow=True,
    )
    assert done.status_code == 200
    org.refresh_from_db()
    assert org.is_active is False
    event = AuditEvent.objects.get(action="deactivated", organization=org)
    assert event.actor == admin_user
    assert any("askıya alındı" in m for m in _messages(done))


def test_reactivating_needs_no_question(agency, pilot):
    Organization.objects.filter(pk=pilot.organization.pk).update(is_active=False)
    response = _run(agency, "reactivate", [pilot.organization], follow=True)
    pilot.organization.refresh_from_db()
    assert pilot.organization.is_active is True
    assert any("yeniden etkinleştirildi" in m for m in _messages(response))


@pytest.mark.parametrize("days", [7, 14, 30])
def test_the_trial_is_extended(agency, trial, days):
    before = PlanSettings.objects.get(organization=trial.organization).trial_ends_at

    response = _run(agency, f"extend_trial_{days}", [trial.organization], follow=True)

    after = PlanSettings.objects.get(organization=trial.organization).trial_ends_at
    assert after == before + timedelta(days=days)
    assert any(f"{days} gün uzatıldı" in m for m in _messages(response))
    event = AuditEvent.objects.filter(organization=trial.organization, action="plan_changed").latest("id")
    assert event.payload["reason"] == "trial_extended"


def test_a_paid_customer_is_told_why_the_trial_was_not_extended(agency, pilot):
    response = _run(agency, "extend_trial_7", [pilot.organization], follow=True)
    ps = PlanSettings.objects.get(organization=pilot.organization)
    assert ps.active_plan == "pro" and ps.trial_ends_at is None
    assert any("Pilot Kafe" in m and "paketi" in m for m in _messages(response))


def test_the_password_action_asks_then_shows_the_new_password_once(agency, pilot):
    asked = _run(agency, "reset_owner_password", [pilot.organization])
    assert asked.status_code == 200 and "Evet, uygula" in asked.content.decode()

    shown = agency.post(
        LIST,
        {"action": "reset_owner_password", "_selected_action": [str(pilot.organization.pk)],
         "confirm": "yes", "select_across": "0"},
    )

    assert shown.status_code == 200
    assert "no-store" in shown["Cache-Control"]
    html = shown.content.decode()
    password = html.split('data-testid="temporary-password">')[1].split("<")[0].strip()
    assert len(password) == 10
    assert User.objects.get(email="owner@pilot.test").check_password(password)
    assert "bir daha gösterilmez" in html


def test_the_password_action_wants_exactly_one_customer(agency, pilot, trial):
    response = _run(agency, "reset_owner_password", [pilot.organization, trial.organization], follow=True)
    assert any("tek bir müşteri" in m for m in _messages(response))
    assert User.objects.get(email="owner@pilot.test").check_password(pilot.temporary_password)


def test_plain_staff_without_permissions_cannot_use_the_list(client, db):
    User.objects.create_user(email="stajyer@agency.test", password="x", is_staff=True)
    client.login(email="stajyer@agency.test", password="x")
    assert client.get(LIST).status_code == 403
