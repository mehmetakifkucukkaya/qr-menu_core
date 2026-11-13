"""``seed_demo`` creates a known super-user with a published default password.
It must refuse to run on anything that looks like production (SPEC §3.5)."""

from __future__ import annotations

from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.accounts.models import User
from apps.billing.models import PlanSettings

pytestmark = pytest.mark.django_db

PRIVATE_PASSWORD = "a-private-demo-password-1"


def _seed(**options):
    call_command("seed_demo", stdout=StringIO(), **options)


def test_seed_demo_runs_when_debug_is_on(settings, monkeypatch):
    settings.DEBUG = True
    monkeypatch.setenv("DEMO_ADMIN_EMAIL", "demo-admin@test.local")
    _seed()
    assert User.objects.filter(email="demo-admin@test.local", is_superuser=True).exists()


def test_seed_demo_puts_the_demo_business_on_the_ops_plan(settings, monkeypatch):
    settings.DEBUG = True
    _seed()
    plan = PlanSettings.objects.get(organization__slug="modern-cafe")
    assert plan.active_plan == "ops"
    assert plan.orders_enabled is True


def test_seed_demo_refuses_when_debug_is_off(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError, match="DEBUG"):
        _seed()
    assert not User.objects.filter(is_superuser=True).exists()


def test_override_flag_still_needs_a_private_password(settings, monkeypatch):
    settings.DEBUG = False
    monkeypatch.delenv("DEMO_ADMIN_PASSWORD", raising=False)
    with pytest.raises(CommandError, match="DEMO_ADMIN_PASSWORD"):
        _seed(allow_non_debug=True)
    assert not User.objects.filter(is_superuser=True).exists()


def test_override_flag_rejects_the_published_default_password(settings, monkeypatch):
    settings.DEBUG = False
    monkeypatch.setenv("DEMO_ADMIN_PASSWORD", "change-me-demo-only")
    with pytest.raises(CommandError, match="DEMO_ADMIN_PASSWORD"):
        _seed(allow_non_debug=True)


def test_override_flag_with_a_private_password_runs(settings, monkeypatch):
    settings.DEBUG = False
    monkeypatch.setenv("DEMO_ADMIN_PASSWORD", PRIVATE_PASSWORD)
    monkeypatch.setenv("DEMO_ADMIN_EMAIL", "demo-admin@test.local")
    _seed(allow_non_debug=True)
    assert User.objects.get(email="demo-admin@test.local").check_password(PRIVATE_PASSWORD)
