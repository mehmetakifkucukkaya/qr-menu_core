"""Organization isolation tests.

Verifies that a user belonging to org A cannot see/edit org B's data via
the API. This is the foundation of multi-tenant security.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def test_list_branches_filters_to_user_orgs(api_client, org_a, org_b):
    """User A sees only their branch (none yet), and cannot reach B's data."""
    _login(api_client, "owner-a@example.com")

    response = api_client.get("/api/v1/admin/branches/")
    assert response.status_code == 200
    # No branches created yet — but the queryset must be filtered to org_a
    # (i.e., not crash and not show anything from org_b even if added later).
    assert response.json()["count"] == 0


def test_create_branch_in_own_organization_succeeds(api_client, org_a):
    """User A can create a branch under org A."""
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/branches/",
        data={
            "organization_id": org_a.id,
            "name": "A Kadıköy",
            "slug": "a-kadikoy",
            "is_active": True,
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    assert response.json()["name"] == "A Kadıköy"


def test_cannot_create_branch_under_other_organization(api_client, org_a, org_b):
    """User A tries to create a branch under org B → 400 (FK violation or validation)."""
    from rest_framework.exceptions import ValidationError as DRFValidationError

    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/branches/",
        data={
            "organization_id": org_b.id,
            "name": "B Branch",
            "slug": "b-branch",
            "is_active": True,
        },
        format="json",
    )
    # 400 because the org_id is filtered out of writable queryset (DRF
    # returns 400 when a related field doesn't validate against queryset).
    assert response.status_code in (400, 403), response.json()


def test_cannot_view_other_orgs_branches(api_client, org_a, org_b):
    """User B creates a branch; user A cannot see it via list."""
    # Log in as B first, create a branch under org_b.
    _login(api_client, "owner-b@example.com")
    resp = api_client.post(
        "/api/v1/admin/branches/",
        data={
            "organization_id": org_b.id,
            "name": "B Branch",
            "slug": "b-branch",
            "is_active": True,
        },
        format="json",
    )
    assert resp.status_code == 201
    branch_id = resp.json()["id"]

    # Now log out and log in as A.
    api_client.post("/api/v1/auth/logout")
    _login(api_client, "owner-a@example.com")

    # A's list is empty.
    list_resp = api_client.get("/api/v1/admin/branches/")
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 0

    # A cannot directly fetch B's branch.
    detail = api_client.get(f"/api/v1/admin/branches/{branch_id}/")
    assert detail.status_code == 404


def test_organization_listing_filters_to_users_memberships(api_client, org_a, org_b):
    """GET /api/v1/admin/organizations/ → only orgs the user belongs to."""
    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/organizations/")
    assert response.status_code == 200
    slugs = [item["slug"] for item in response.json()["results"]]
    assert "cafe-a" in slugs
    assert "cafe-b" not in slugs


def test_platform_admin_can_see_all_organizations(api_client, org_a, org_b, admin_user):
    """User.role == admin bypasses tenant isolation."""
    _login(api_client, admin_user.email, password="test-pass-123")
    response = api_client.get("/api/v1/admin/organizations/")
    assert response.status_code == 200
    slugs = {item["slug"] for item in response.json()["results"]}
    assert {"cafe-a", "cafe-b"}.issubset(slugs)
