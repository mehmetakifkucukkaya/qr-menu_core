"""``access_state`` on ``/api/v1/me`` and the sign-in reply: why an open session
can (not) work. Suspending a customer in the agency panel leaves its team's
browsers signed in; the panel needs the reason to say so instead of failing
every request."""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Membership
from apps.accounts.serializers import UserSerializer
from apps.organizations.models import Organization

pytestmark = pytest.mark.django_db


def _owner(org):
    return org.memberships.get().user


def _state(user) -> str:
    return UserSerializer(user).data["access_state"]


def test_a_member_of_an_active_business_is_ok(org_a):
    assert _state(_owner(org_a)) == "ok"


def test_the_agency_is_ok_without_any_membership(admin_user):
    assert _state(admin_user) == "ok"


def test_members_of_a_suspended_business_are_told_so(org_a):
    Organization.objects.filter(pk=org_a.pk).update(is_active=False)
    data = UserSerializer(_owner(org_a)).data
    assert data["access_state"] == "suspended"
    assert data["membership_role"] is None


def test_a_deactivated_member_and_a_stray_account_have_no_business(org_a, django_user_model):
    Membership.objects.filter(organization=org_a).update(is_active=False)
    assert _state(_owner(org_a)) == "no_membership"
    stray = django_user_model.objects.create_user(email="stray@x.test", password="x")
    assert _state(stray) == "no_membership"


def test_an_open_session_learns_it_from_me(org_a):
    client = APIClient()
    client.force_login(_owner(org_a))
    assert client.get("/api/v1/me").json()["data"]["access_state"] == "ok"

    Organization.objects.filter(pk=org_a.pk).update(is_active=False)

    me = client.get("/api/v1/me")
    assert me.status_code == 200  # /me is not behind the role gate
    assert me.json()["data"]["access_state"] == "suspended"


def test_the_sign_in_reply_carries_it(django_user_model, org_a):
    user = _owner(org_a)
    user.set_password("Kendi-Sifrem-1!")
    user.save()
    reply = APIClient().post(
        "/api/v1/auth/login", {"email": user.email, "password": "Kendi-Sifrem-1!"}, format="json"
    )
    assert reply.status_code == 200
    assert reply.json()["data"]["access_state"] == "ok"
