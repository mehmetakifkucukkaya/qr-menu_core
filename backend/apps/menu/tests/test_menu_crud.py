"""Menu CRUD tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def _login(client, email, password="x"):
    return client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


def test_create_menu_with_branch(api_client, org_a):
    """Owner of org_a can create a menu under org_a with a branch."""
    from apps.branches.models import Branch

    branch = Branch.objects.create(
        organization=org_a, name="Kadıköy", slug="kadikoy"
    )
    _login(api_client, "owner-a@example.com")
    response = api_client.post(
        "/api/v1/admin/menus/",
        data={
            "organization_id": org_a.id,
            "branch_id": branch.id,
            "name": "Test Menu",
            "description": "Test description",
        },
        format="json",
    )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert payload["name"] == "Test Menu"
    assert payload["slug"] == "test-menu"  # auto-generated
    assert payload["organization"]["id"] == org_a.id
    assert payload["branch"]["id"] == branch.id


def test_list_menus_tenant_scoped(api_client, org_a, org_b):
    """User A sees only menus of org A, not org B."""
    from apps.menu.models import Menu

    menu_a = Menu.objects.create(
        organization=org_a, name="A Menu", slug="a-menu", is_active=True
    )
    menu_b = Menu.objects.create(
        organization=org_b, name="B Menu", slug="b-menu", is_active=True
    )

    _login(api_client, "owner-a@example.com")
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code == 200
    ids = [r["id"] for r in response.json()["data"]["results"]]
    assert menu_a.id in ids
    assert menu_b.id not in ids


def test_update_menu_publish_sets_published_at(api_client, org_a, menu):
    """PATCH is_active=True sets published_at on first activation."""
    # Deactivate first
    menu.is_active = False
    menu.published_at = None
    menu.save()
    assert menu.published_at is None

    _login(api_client, "owner-a@example.com")
    response = api_client.patch(
        f"/api/v1/admin/menus/{menu.id}/",
        data={"is_active": True},
        format="json",
    )
    assert response.status_code == 200, response.json()

    menu.refresh_from_db()
    assert menu.published_at is not None


def test_unique_slug_per_organization(api_client, org_a):
    """Two menus with same slug in same org → second one auto-suffixed."""
    from apps.menu.models import Menu

    Menu.objects.create(
        organization=org_a, name="Kahve", slug="kahve", is_active=True
    )
    # Second creation with same name → should auto-suffix
    m2 = Menu.objects.create(
        organization=org_a, name="Kahve", is_active=True
    )
    assert m2.slug == "kahve-2"

    # Same slug in different org → allowed
    from apps.organizations.models import Organization

    org_c = Organization.objects.create(
        name="Other Cafe", slug="other-cafe", default_locale="tr",
        supported_locales=["tr", "en"], currency="TRY", is_active=True,
    )
    from apps.accounts.models import Membership, MembershipRole, User

    user_c = User.objects.create_user(email="c@example.com", password="x")
    Membership.objects.create(user=user_c, organization=org_c, role=MembershipRole.OWNER)
    m3 = Menu.objects.create(organization=org_c, name="Kahve", is_active=True)
    assert m3.slug == "kahve"  # OK, different org


def test_default_locale_tr(api_client, org_a):
    """Menu defaults to default_locale='tr' when not provided."""
    from apps.menu.models import Menu

    menu = Menu.objects.create(
        organization=org_a, name="Auto Locale", is_active=True
    )
    assert menu.default_locale == "tr"
    assert menu.supported_locales == []  # JSONField default