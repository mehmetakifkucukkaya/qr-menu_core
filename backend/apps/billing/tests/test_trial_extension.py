"""Trial length and the agency's "extend the trial" (SPEC_PILOT_READINESS 4.1, 4.3).

A trial is a window of full (OPS) features on top of BASIC; when it closes the
tenant drops back to BASIC (``expire_trial``). The agency opens a customer with
``trial_days`` and later extends the window from the Django admin.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditEvent
from apps.billing.constants import FEATURE_FIELDS, default_features
from apps.billing.models import PlanSettings
from apps.billing.services import extend_trial, get_plan_settings
from apps.onboarding import services as onboarding

pytestmark = pytest.mark.django_db


def _plan(org, plan, **fields):
    return PlanSettings.objects.create(
        organization=org, active_plan=plan, **default_features(plan), **fields
    )


def _length(ps):
    return ps.trial_ends_at - ps.trial_started_at


def test_start_trial_defaults_to_fourteen_days(org_a):
    _plan(org_a, "basic")
    ps = onboarding.start_trial(org_a)
    assert ps.active_plan == "ops"
    assert abs(_length(ps) - timedelta(days=14)) < timedelta(seconds=1)


def test_start_trial_takes_a_length(org_a):
    _plan(org_a, "basic")
    ps = onboarding.start_trial(org_a, days=7)
    assert abs(_length(ps) - timedelta(days=7)) < timedelta(seconds=1)
    assert "7d" in ps.billing_notes
    assert all(getattr(ps, f) is default_features("ops")[f] for f in FEATURE_FIELDS)


def test_extending_a_running_trial_moves_its_end(org_a):
    _plan(org_a, "basic")
    ps = onboarding.start_trial(org_a, days=3)
    old_end = ps.trial_ends_at

    ps = extend_trial(org_a, 7)

    assert ps.active_plan == "ops"
    assert ps.trial_ends_at == old_end + timedelta(days=7)


def test_extending_after_the_trial_ended_starts_a_fresh_one(org_a):
    now = timezone.now()
    _plan(
        org_a, "basic",
        trial_started_at=now - timedelta(days=20), trial_ends_at=now - timedelta(days=6),
    )

    ps = extend_trial(org_a, 14)

    assert ps.active_plan == "ops"
    assert abs(ps.trial_ends_at - (timezone.now() + timedelta(days=14))) < timedelta(seconds=5)
    assert ps.cart_enabled and ps.orders_enabled


def test_extending_a_trial_that_ended_but_was_not_swept_yet(org_a):
    """The row still says OPS; reading the plan ends the trial first, then a new one starts."""
    now = timezone.now()
    _plan(
        org_a, "ops",
        trial_started_at=now - timedelta(days=20), trial_ends_at=now - timedelta(days=1),
    )

    ps = extend_trial(org_a, 7)

    assert ps.active_plan == "ops"
    assert ps.trial_ends_at > now + timedelta(days=6)


def test_a_basic_tenant_that_never_had_a_trial_can_be_given_one(org_a):
    _plan(org_a, "basic")
    ps = extend_trial(org_a, 30)
    assert ps.active_plan == "ops"
    assert abs(_length(ps) - timedelta(days=30)) < timedelta(seconds=1)


def test_a_tenant_without_a_plan_row_counts_as_basic(org_a, settings):
    settings.BILLING_DEFAULT_PLAN = "basic"
    ps = extend_trial(org_a, 14)
    assert ps.active_plan == "ops" and ps.trial_ends_at is not None


@pytest.mark.parametrize("plan", ["pro", "orders", "ops"])
def test_a_paid_plan_is_never_put_on_a_trial(org_a, plan):
    """A trial ends by dropping the tenant to BASIC - that would be a downgrade."""
    _plan(org_a, plan)
    with pytest.raises(ValueError) as caught:
        extend_trial(org_a, 14)
    assert "paket" in str(caught.value).lower()
    ps = PlanSettings.objects.get(organization=org_a)
    assert ps.active_plan == plan and ps.trial_ends_at is None


@pytest.mark.parametrize("days", [0, -3])
def test_the_length_must_be_positive(org_a, days):
    _plan(org_a, "basic")
    with pytest.raises(ValueError):
        extend_trial(org_a, days)


def test_extending_is_audited(org_a):
    _plan(org_a, "basic")
    onboarding.start_trial(org_a, days=3)
    extend_trial(org_a, 7)

    event = AuditEvent.objects.filter(organization=org_a, action="plan_changed").latest("id")
    assert event.target_type == "plan_settings"
    assert event.payload["reason"] == "trial_extended"
    assert event.payload["days"] == 7
    assert event.payload["trial_ends_at"]


def test_other_tenants_are_untouched(org_a, org_b):
    _plan(org_a, "basic")
    _plan(org_b, "basic")
    extend_trial(org_a, 7)
    other = get_plan_settings(org_b)
    assert other.active_plan == "basic" and other.trial_ends_at is None
