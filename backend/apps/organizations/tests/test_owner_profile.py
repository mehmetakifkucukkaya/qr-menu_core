"""F-30: a real tenant owner can read and edit their own business profile.

The demo account is a platform admin, which short-circuits the object-level
permission, so the bug (403 on the owner's own organization) never showed up
in the panel. These tests use a plain owner.
"""

from __future__ import annotations

import pytest

from apps.accounts.models import Membership, MembershipRole
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db


def _owner(org):
    return org.memberships.get(role=MembershipRole.OWNER).user


def _sign_in_role(api_client, django_user_model, org, role):
    user = django_user_model.objects.create_user(email=f"{role}@a.example", password="x", role="staff")
    Membership.objects.create(user=user, organization=org, role=role)
    api_client.force_login(user)


def _gate_denied(response) -> bool:
    return (
        response.status_code == 403
        and response.json().get("error", {}).get("code") == "auth.role_forbidden"
    )


def _url(org) -> str:
    return f"/api/v1/admin/organizations/{org.id}/"


def test_owner_can_read_their_own_organization(api_client, org_a):
    api_client.force_login(_owner(org_a))
    response = api_client.get(_url(org_a))
    assert response.status_code == 200, response.content
    assert response.json()["slug"] == "cafe-a"


def test_owner_can_edit_their_business_profile(api_client, org_a):
    api_client.force_login(_owner(org_a))
    response = api_client.patch(
        _url(org_a), {"name": "Cafe A Yeni", "phone": "+90 212 000 00 00"}, format="json"
    )
    assert response.status_code == 200, response.content
    org_a.refresh_from_db()
    assert org_a.name == "Cafe A Yeni"
    assert org_a.phone == "+90 212 000 00 00"


def test_owner_cannot_change_slug_or_suspend_their_own_business(api_client, org_a):
    api_client.force_login(_owner(org_a))
    response = api_client.patch(_url(org_a), {"slug": "hijacked", "is_active": False}, format="json")
    assert response.status_code == 200  # read-only fields are ignored, not rejected
    org_a.refresh_from_db()
    assert org_a.slug == "cafe-a"
    assert org_a.is_active is True


def test_owner_cannot_delete_their_business(api_client, org_a):
    api_client.force_login(_owner(org_a))
    response = api_client.delete(_url(org_a))
    assert _gate_denied(response)
    assert Organization.objects.filter(pk=org_a.pk).exists()


@pytest.mark.parametrize("role", [MembershipRole.MANAGER, MembershipRole.STAFF, MembershipRole.KITCHEN])
def test_only_the_owner_can_write_the_profile(api_client, django_user_model, org_a, role):
    _sign_in_role(api_client, django_user_model, org_a, role)
    response = api_client.patch(_url(org_a), {"name": "Ele geçirildi"}, format="json")
    assert _gate_denied(response)
    org_a.refresh_from_db()
    assert org_a.name == "Cafe A"


@pytest.mark.parametrize("role", [MembershipRole.MANAGER, MembershipRole.STAFF, MembershipRole.KITCHEN])
def test_every_role_can_read_the_profile_for_the_sidebar(api_client, django_user_model, org_a, role):
    _sign_in_role(api_client, django_user_model, org_a, role)
    response = api_client.get("/api/v1/admin/organizations/")
    assert response.status_code == 200
    assert [row["slug"] for row in response.json()["results"]] == ["cafe-a"]


def test_owner_cannot_reach_another_organization(api_client, org_a, org_b):
    api_client.force_login(_owner(org_a))
    assert api_client.get(_url(org_b)).status_code == 404
    assert api_client.patch(_url(org_b), {"name": "x"}, format="json").status_code == 404


def test_platform_admin_can_still_change_slug_and_suspend(api_client, admin_user, org_a):
    api_client.force_login(admin_user)
    response = api_client.patch(_url(org_a), {"slug": "cafe-a2", "is_active": False}, format="json")
    assert response.status_code == 200, response.content
    org_a.refresh_from_db()
    assert org_a.slug == "cafe-a2"
    assert org_a.is_active is False
