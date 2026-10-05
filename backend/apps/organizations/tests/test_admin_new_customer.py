"""The "Yeni müşteri aç" screen of the agency panel (SPEC_PILOT_READINESS 4.3):
one form, the same ``provision_tenant`` service as ``create_tenant``, a result card
whose temporary password is shown once."""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import AuditEvent
from apps.billing.models import PlanSettings
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db

NEW = "admin:organizations_organization_provision"
LIST = "admin:organizations_organization_changelist"

FORM = {
    "name": "Pilot Kafe",
    "slug": "pilot-kafe",
    "owner_name": "Pilot Sahibi",
    "owner_email": "owner@pilot.test",
    "plan": "pro",
    "modules": ["orders"],
    "trial_days": "",
    "default_locale": "tr",
    "currency": "TRY",
}


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


def _shown_password(response) -> str:
    return response.content.decode().split('data-testid="temporary-password">')[1].split("<")[0].strip()


def test_the_list_offers_the_new_customer_screen_instead_of_the_bare_add_form(agency):
    html = agency.get(reverse(LIST)).content.decode()
    assert reverse(NEW) in html and "Yeni müşteri aç" in html
    assert agency.get(reverse("admin:organizations_organization_add")).status_code == 403


def test_the_form_asks_for_what_provisioning_needs(agency):
    response = agency.get(reverse(NEW))
    html = response.content.decode()
    assert response.status_code == 200
    for name in ("name", "slug", "owner_name", "owner_email", "plan", "modules", "trial_days",
                 "default_locale", "currency"):
        assert f'name="{name}"' in html, name


def test_opening_a_customer_shows_the_card_once(agency, admin_user):
    response = agency.post(reverse(NEW), FORM)

    assert response.status_code == 200, response.content.decode()[:1500]
    assert "no-store" in response["Cache-Control"]
    html = response.content.decode()
    password = _shown_password(response)
    assert len(password) == 10
    assert "owner@pilot.test" in html
    assert "/login" in html and "/m/pilot-kafe" in html
    assert "bir daha gösterilmez" in html

    org = Organization.objects.get(slug="pilot-kafe")
    ps = PlanSettings.objects.get(organization=org)
    assert (ps.active_plan, ps.orders_enabled, ps.cart_enabled) == ("pro", True, True)
    assert org.menus.get().slug == "ana-menu" and org.qr_codes.count() == 1
    event = AuditEvent.objects.get(organization=org, action="tenant_created")
    assert event.actor == admin_user and event.payload["signup_source"] == "agency"

    # The owner can sign in with it - and must replace it.
    login = APIClient().post(
        "/api/v1/auth/login", {"email": "owner@pilot.test", "password": password}, format="json"
    )
    assert login.status_code == 200
    assert login.json()["data"]["must_change_password"] is True


def test_a_trial_for_a_basic_customer(agency):
    response = agency.post(reverse(NEW), {**FORM, "plan": "basic", "modules": [], "trial_days": "14"})
    assert response.status_code == 200
    ps = PlanSettings.objects.get(organization__slug="pilot-kafe")
    assert ps.active_plan == "ops" and ps.trial_ends_at is not None


@pytest.mark.parametrize(
    "change, field, needle",
    [
        ({"slug": "login"}, "slug", "ayrılmış"),
        ({"slug": "Has Space"}, "slug", "küçük harf"),
        ({"plan": "pro", "trial_days": "7", "modules": []}, "trial_days", "basic paketle"),
        ({"owner_email": "not-an-email"}, "owner_email", "e-posta"),
        ({"name": ""}, "name", "zorunlu"),
    ],
)
def test_mistakes_are_shown_on_the_form_and_nothing_is_created(agency, change, field, needle):
    response = agency.post(reverse(NEW), {**FORM, **change})

    assert response.status_code == 200
    assert needle in " ".join(response.context["form"].errors.get(field, [])).lower()
    assert not Organization.objects.exists() and not User.objects.filter(email="owner@pilot.test").exists()
    assert "temporary-password" not in response.content.decode()


def test_submitting_twice_does_not_open_two_customers(agency):
    assert agency.post(reverse(NEW), FORM).status_code == 200
    again = agency.post(reverse(NEW), FORM)
    assert again.status_code == 200
    assert set(again.context["form"].errors) >= {"slug", "owner_email"}
    assert Organization.objects.filter(slug="pilot-kafe").count() == 1


def test_only_the_agency_may_open_customers(client, db):
    assert client.get(reverse(NEW)).status_code == 302  # to the login
    User.objects.create_user(email="stajyer@agency.test", password="x", is_staff=True)
    client.login(email="stajyer@agency.test", password="x")
    assert client.get(reverse(NEW)).status_code == 403
    assert client.post(reverse(NEW), FORM).status_code == 403
    assert not Organization.objects.exists()
