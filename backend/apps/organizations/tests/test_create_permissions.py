"""Organization creation is not a tenant capability — ANALYSIS_1 F-09.

Any logged-in user could ``POST /api/v1/admin/organizations/`` and become the
OWNER of a brand-new tenant. The new tenant has no ``PlanSettings`` row, so it
resolved to the unlimited OPS plan (every feature, no limits). Tenants are
created by the signup / onboarding flow; only platform operators may use this
CRUD endpoint to create one.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/organizations/"
PAYLOAD = {"name": "Sneaky Cafe", "slug": "sneaky-cafe"}


def test_tenant_owner_cannot_create_another_organization(org_a, django_user_model):
    owner = django_user_model.objects.get(email="owner-a@example.com")
    client = APIClient()
    client.force_authenticate(user=owner)
    before = Organization.objects.count()

    response = client.post(URL, data=PAYLOAD, format="json")

    assert response.status_code == 403
    assert Organization.objects.count() == before
    assert not Organization.objects.filter(slug="sneaky-cafe").exists()


def test_anonymous_cannot_create_organization():
    response = APIClient().post(URL, data=PAYLOAD, format="json")

    assert response.status_code in {401, 403}
    assert not Organization.objects.filter(slug="sneaky-cafe").exists()


def test_platform_admin_can_still_create_organization(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)

    response = client.post(URL, data=PAYLOAD, format="json")

    assert response.status_code == 201, response.content
    assert Organization.objects.filter(slug="sneaky-cafe").exists()
