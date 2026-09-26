"""Shared pytest fixtures."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def admin_user(django_user_model):
    """Pre-created platform admin."""
    return django_user_model.objects.create_user(
        email="admin@example.com",
        password="test-pass-123",
        full_name="Test Admin",
        role="admin",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def org_a(django_user_model):
    """Organization A with owner user."""
    from apps.accounts.models import Membership, MembershipRole
    from apps.organizations.models import Organization

    user_a = django_user_model.objects.create_user(
        email="owner-a@example.com", password="x", role="owner"
    )
    org = Organization.objects.create(
        name="Cafe A",
        slug="cafe-a",
        default_locale="tr",
        supported_locales=["tr", "en"],
        currency="TRY",
        is_active=True,
    )
    Membership.objects.create(user=user_a, organization=org, role=MembershipRole.OWNER)
    return org


@pytest.fixture
def org_b(django_user_model):
    """Organization B with owner user (separate tenant)."""
    from apps.accounts.models import Membership, MembershipRole
    from apps.organizations.models import Organization

    user_b = django_user_model.objects.create_user(
        email="owner-b@example.com", password="x", role="owner"
    )
    org = Organization.objects.create(
        name="Cafe B",
        slug="cafe-b",
        default_locale="tr",
        supported_locales=["tr", "en"],
        currency="TRY",
        is_active=True,
    )
    Membership.objects.create(user=user_b, organization=org, role=MembershipRole.OWNER)
    return org
