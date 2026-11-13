"""``manage.py create_tenant`` (SPEC_PILOT_READINESS 4.2): the agency opens a
customer from a shell, and the owner can sign in with what it prints."""

from __future__ import annotations

import json
from io import StringIO

import pytest
from django.core.management import CommandError, call_command
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import PlanSettings
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db

PILOT = [
    "--name", "Pilot Kafe",
    "--slug", "pilot-kafe",
    "--owner-email", "owner@pilot.test",
]


def _run(*args):
    out = StringIO()
    call_command("create_tenant", *args, stdout=out)
    return out.getvalue()


def test_the_pilot_day_command_opens_a_customer_with_orders():
    card = json.loads(_run(*PILOT, "--plan", "pro", "--modules", "orders", "--json"))

    assert card["organization"]["slug"] == "pilot-kafe"
    assert card["owner_email"] == "owner@pilot.test"
    assert card["plan"] == "pro" and card["modules"] == ["orders"]
    assert card["trial_ends_at"] is None and card["qr_id"]
    assert len(card["temporary_password"]) == 10
    ps = PlanSettings.objects.get(organization__slug="pilot-kafe")
    assert ps.orders_enabled and ps.cart_enabled and not ps.loyalty_enabled


def test_the_card_carries_absolute_links(settings):
    settings.PUBLIC_BASE_URL = "https://menu.example.com/"
    card = json.loads(_run(*PILOT, "--json"))
    assert card["login_url"] == "https://menu.example.com/login"
    assert card["menu_url"] == "https://menu.example.com/m/pilot-kafe"


def test_the_owner_signs_in_with_the_printed_password_and_must_change_it():
    card = json.loads(_run(*PILOT, "--owner-name", "Pilot Sahibi", "--json"))

    response = APIClient().post(
        "/api/v1/auth/login",
        {"email": card["owner_email"], "password": card["temporary_password"]},
        format="json",
    )

    assert response.status_code == 200, response.content
    me = response.json()["data"]
    assert me["membership_role"] == "owner"
    assert me["must_change_password"] is True
    assert me["full_name"] == "Pilot Sahibi"


def test_the_plain_output_is_a_readable_turkish_card():
    text = _run(*PILOT, "--plan", "pro", "--modules", "orders,loyalty")
    user = User.objects.get(email="owner@pilot.test")
    assert "Müşteri açıldı: Pilot Kafe (pilot-kafe)" in text
    assert "http://localhost:3000/login" in text
    assert "owner@pilot.test" in text
    assert "bir kez gösterilir" in text
    assert "orders, loyalty" in text
    # The password printed is the real one.
    password = text.split("Geçici şifre    : ")[1].split()[0]
    assert user.check_password(password)


def test_a_trial_for_a_basic_customer():
    card = json.loads(_run(*PILOT, "--trial-days", "14", "--json"))
    assert card["trial_ends_at"]
    assert PlanSettings.objects.get(organization__slug="pilot-kafe").active_plan == "ops"


def test_locale_and_currency_are_applied():
    _run(*PILOT, "--locale", "en", "--currency", "EUR", "--json")
    org = Organization.objects.get(slug="pilot-kafe")
    assert (org.default_locale, org.supported_locales, org.currency) == ("en", ["en"], "EUR")


@pytest.mark.parametrize(
    "extra, needle",
    [
        (["--plan", "pro", "--trial-days", "7"], "trial_days"),
        (["--modules", "orders,payments"], "modules"),
        (["--trial-days", "200"], "trial_days"),
        (["--plan", "gold"], "invalid choice"),
    ],
)
def test_bad_options_fail_loudly_and_create_nothing(extra, needle):
    with pytest.raises(CommandError) as caught:
        _run(*PILOT, *extra, "--json")
    assert needle in str(caught.value)
    assert not Organization.objects.exists() and not User.objects.exists()


def test_a_taken_slug_is_reported_by_name():
    _run(*PILOT, "--json")
    with pytest.raises(CommandError) as caught:
        _run("--name", "Başka", "--slug", "pilot-kafe", "--owner-email", "baska@pilot.test")
    assert "slug" in str(caught.value)
    assert Organization.objects.count() == 1


def test_required_options_are_enforced():
    with pytest.raises(CommandError):
        _run("--name", "Eksik")
