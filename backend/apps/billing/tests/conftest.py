"""Shared fixtures for the billing test suite — Sprint B1 (D-026).

Reuses the project-wide ``conftest.py`` fixtures (``org_a``, ``org_b``,
``admin_user``, ``api_client``, ``user_a``, ``user_b``) and adds two
autouse reset fixtures + a billing-specific factory wrapper.

The throttle cache is cleared (matches payment/account conftest
pattern) so an exhausted bucket from an unrelated test can't block
the public orders / request-link guard tests.

The audit thread-local is reset between tests so ``record_event``
calls inside the billing services don't leak actor/IP across cases.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Reset DRF anon-throttle cache between tests."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _reset_audit_context():
    """Clear the audit thread-local between tests (D-016 / D-026 mirror)."""
    from apps.audit.context import _local, clear

    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")
    yield
    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")


# ---------------------------------------------------------------------------
# Billing-specific factories
# ---------------------------------------------------------------------------


@pytest.fixture
def organization_a(org_a):
    """Alias to match the payment conftest naming convention."""
    return org_a


@pytest.fixture
def organization_b(org_b):
    return org_b


@pytest.fixture
def user_a(org_a):
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="owner-a@example.com")


@pytest.fixture
def user_b(org_b):
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="owner-b@example.com")


@pytest.fixture
def make_plan_settings(db):
    """Factory wrapper — see apps.billing.tests.factories.make_plan_settings."""
    from apps.billing.tests.factories import make_plan_settings as _make

    return _make


@pytest.fixture
def make_usage_counter(db):
    """Factory wrapper — see apps.billing.tests.factories.make_usage_counter."""
    from apps.billing.tests.factories import make_usage_counter as _make

    return _make


@pytest.fixture
def basic_org(django_user_model):
    """A second organization with PlanSettings pinned to BASIC.

    Used by guard tests that need a tenant where the feature flag is
    guaranteed to be False (BASIC tier has every flag off by default).
    """
    from apps.accounts.models import Membership, MembershipRole
    from apps.billing.tests.factories import make_plan_settings
    from apps.organizations.models import Organization

    user = django_user_model.objects.create_user(
        email="basic-owner@example.com", password="x", role="owner"
    )
    org = Organization.objects.create(
        name="Basic Cafe",
        slug="basic-cafe",
        default_locale="tr",
        supported_locales=["tr", "en"],
        currency="TRY",
        is_active=True,
    )
    Membership.objects.create(
        user=user, organization=org, role=MembershipRole.OWNER
    )
    make_plan_settings(org, plan="basic")
    return org


@pytest.fixture
def basic_user(basic_org):
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="basic-owner@example.com")