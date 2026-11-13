"""Deactivated memberships and suspended organizations lose access everywhere
the "which organization does this user operate as?" question is answered."""

from __future__ import annotations

import pytest

from apps.accounts.models import Membership, MembershipRole
from apps.accounts.services import get_active_membership, resolve_membership_state
from apps.menu.models import Menu
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db


@pytest.fixture
def multi_user(django_user_model, org_a, org_b):
    """A user who belongs to A (deactivated) and B (active)."""
    user = django_user_model.objects.create_user(email="multi@example.com", password="x")
    Membership.objects.create(user=user, organization=org_a, role=MembershipRole.OWNER, is_active=False)
    Membership.objects.create(user=user, organization=org_b, role=MembershipRole.MANAGER)
    return user


def test_get_active_membership_skips_deactivated_memberships(multi_user, org_b):
    membership = get_active_membership(multi_user)
    assert membership is not None
    assert membership.organization_id == org_b.id
    assert membership.role == MembershipRole.MANAGER


def test_get_active_membership_skips_suspended_organizations(django_user_model, org_a):
    user = org_a.memberships.get().user
    org_a.is_active = False
    org_a.save(update_fields=["is_active"])
    assert get_active_membership(user) is None


def test_get_active_membership_is_none_for_anonymous():
    from django.contrib.auth.models import AnonymousUser

    assert get_active_membership(AnonymousUser()) is None
    assert get_active_membership(None) is None


def test_membership_state_distinguishes_suspended_from_missing(django_user_model, org_a):
    owner = org_a.memberships.get().user
    assert resolve_membership_state(owner)[0] == "ok"

    org_a.is_active = False
    org_a.save(update_fields=["is_active"])
    assert resolve_membership_state(owner) == ("suspended", None)

    stranger = django_user_model.objects.create_user(email="stranger@example.com", password="x")
    assert resolve_membership_state(stranger) == ("no_membership", None)


def test_organization_is_member_and_for_user_ignore_deactivated_memberships(multi_user, org_a, org_b):
    assert org_a.is_member(multi_user) is False
    assert org_b.is_member(multi_user) is True
    assert list(Organization.objects.for_user(multi_user)) == [org_b]
    assert org_a.membership_for(multi_user) is None
    assert org_b.membership_for(multi_user).role == MembershipRole.MANAGER


def test_platform_admin_is_always_a_member(admin_user, org_a):
    assert org_a.is_member(admin_user) is True
    assert org_a in Organization.objects.for_user(admin_user)


def test_menu_listing_only_shows_organizations_with_an_active_membership(
    api_client, multi_user, org_a, org_b
):
    Menu.objects.create(organization=org_a, name="A menüsü", default_locale="tr", supported_locales=["tr"], is_active=True)
    mb = Menu.objects.create(organization=org_b, name="B menüsü", default_locale="tr", supported_locales=["tr"], is_active=True)
    api_client.force_login(multi_user)
    response = api_client.get("/api/v1/admin/menus/")
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["data"]["results"]]
    assert ids == [mb.id]


def test_resolvers_in_the_view_modules_use_the_active_membership(multi_user, org_b):
    """Every module that used to carry its own "first membership" query now
    answers with the active one (B), not the deactivated one (A)."""
    from types import SimpleNamespace

    from apps.analytics import views_admin as analytics_views
    from apps.audit import views as audit_views
    from apps.branches import views as branches_views
    from apps.media import views as media_views
    from apps.orders import views as orders_views
    from apps.pdf_import import views as pdf_views
    from apps.translate import views as translate_views

    request = SimpleNamespace(user=multi_user)
    for resolve in (
        analytics_views._resolve_organization,
        audit_views._resolve_organization,
        media_views._resolve_organization,
        orders_views._resolve_organization,
        pdf_views._resolve_organization,
        translate_views._resolve_organization,
    ):
        assert resolve(multi_user) == org_b, resolve.__module__
    assert branches_views._resolve_org_for_user(request) == org_b
