"""A tenant nobody classified gets the smallest plan, and a finished trial
really ends (SPEC_PILOT_READINESS §3.5; ANALYSIS_1 F-09)."""

from __future__ import annotations

from datetime import timedelta
from io import StringIO

import pytest
from django.contrib.admin.sites import AdminSite
from django.core.management import call_command
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.billing import services
from apps.billing.admin import PlanSettingsAdmin
from apps.billing.constants import BASIC, OPS, default_features
from apps.billing.models import PlanSettings
from apps.onboarding import services as onboarding

pytestmark = pytest.mark.django_db


def _expired_trial(org) -> PlanSettings:
    """An OPS trial whose 14 days ended yesterday."""
    ps = onboarding.start_trial(org)
    ps.trial_ends_at = timezone.now() - timedelta(days=1)
    ps.save(update_fields=["trial_ends_at"])
    return ps


# ------------------------------------------------------------- default plan


def test_a_tenant_without_a_plan_row_falls_back_to_the_configured_default(settings, org_a):
    settings.BILLING_DEFAULT_PLAN = "basic"
    ps = services.get_plan_settings(org_a)
    assert ps.active_plan == BASIC
    assert ps.orders_enabled is False
    assert ps.ai_pdf_import_enabled is False


def test_the_default_can_be_raised_by_configuration(settings, org_a):
    settings.BILLING_DEFAULT_PLAN = "ops"
    ps = services.get_plan_settings(org_a)
    assert ps.active_plan == OPS
    assert ps.orders_enabled is True


def test_an_invalid_default_falls_back_to_basic(settings, org_a):
    settings.BILLING_DEFAULT_PLAN = "platinum"
    assert services.get_plan_settings(org_a).active_plan == BASIC


def test_an_existing_row_is_never_overwritten_by_the_default(settings, org_a):
    PlanSettings.objects.create(organization=org_a, active_plan=OPS, **default_features(OPS))
    settings.BILLING_DEFAULT_PLAN = "basic"
    assert services.get_plan_settings(org_a).active_plan == OPS


# ------------------------------------------------------------ trial expiry


def test_reading_the_plan_ends_an_expired_trial(org_a):
    _expired_trial(org_a)
    ps = services.get_plan_settings(org_a)
    assert ps.active_plan == BASIC
    assert ps.orders_enabled is False
    assert services.has_feature(org_a, "orders_enabled") is False


def test_expiry_is_audited_with_its_reason(org_a):
    _expired_trial(org_a)
    services.get_plan_settings(org_a)
    event = AuditEvent.objects.filter(organization=org_a, action="plan_changed").latest("id")
    assert event.payload["reason"] == "trial_expired"
    assert event.payload["before"]["active_plan"] == OPS
    assert event.payload["after"]["active_plan"] == BASIC


def test_a_running_trial_is_left_alone(org_a):
    onboarding.start_trial(org_a)
    ps = services.get_plan_settings(org_a)
    assert ps.active_plan == OPS
    assert ps.orders_enabled is True


def test_a_paid_plan_is_never_downgraded_by_a_stale_trial_date(org_a):
    ps = _expired_trial(org_a)
    ps.active_plan = "pro"
    ps.save(update_fields=["active_plan"])
    assert services.get_plan_settings(org_a).active_plan == "pro"


def test_expiry_happens_once(org_a):
    _expired_trial(org_a)
    services.get_plan_settings(org_a)
    services.get_plan_settings(org_a)
    assert AuditEvent.objects.filter(organization=org_a, action="plan_changed").count() == 1


def test_onboarding_expire_helper_reports_whether_it_downgraded(org_a):
    _expired_trial(org_a)
    assert onboarding.expire_trial_if_due(org_a) is True
    assert onboarding.expire_trial_if_due(org_a) is False


# ---------------------------------------------------- explicit plan changes


def test_an_explicit_plan_change_ends_the_trial_window(org_a):
    onboarding.start_trial(org_a)
    services.update_plan_settings(org_a, active_plan="pro")
    ps = PlanSettings.objects.get(organization=org_a)
    assert ps.active_plan == "pro"
    assert ps.trial_started_at is None
    assert ps.trial_ends_at is None


def test_changing_the_plan_in_the_django_admin_ends_the_trial_window(rf, org_a):
    ps = onboarding.start_trial(org_a)
    ps.active_plan = "pro"

    class _Form:
        changed_data = ["active_plan"]

    PlanSettingsAdmin(PlanSettings, AdminSite()).save_model(rf.post("/"), ps, _Form(), change=True)

    ps.refresh_from_db()
    assert ps.active_plan == "pro"
    assert ps.trial_ends_at is None


# ------------------------------------------------------------- the command


def test_expire_trials_command_downgrades_every_due_trial(org_a, org_b):
    _expired_trial(org_a)
    onboarding.start_trial(org_b)  # still running

    out = StringIO()
    call_command("expire_trials", stdout=out)

    assert "1 trial(s) downgraded" in out.getvalue()
    assert PlanSettings.objects.get(organization=org_a).active_plan == BASIC
    assert PlanSettings.objects.get(organization=org_b).active_plan == OPS

    out = StringIO()
    call_command("expire_trials", stdout=out)
    assert "0 trial(s) downgraded" in out.getvalue()
