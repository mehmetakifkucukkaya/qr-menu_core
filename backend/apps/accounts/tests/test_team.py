"""Team management API (SPEC_PILOT_READINESS §3.3): the owner adds, edits,
deactivates and resets the password of floor staff."""

from __future__ import annotations

import re

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Membership, MembershipRole
from apps.accounts.services import TEMP_PASSWORD_ALPHABET, generate_temporary_password
from apps.audit.models import AuditEvent

pytestmark = pytest.mark.django_db

TEAM = "/api/v1/admin/team/"


def _owner(org):
    return org.memberships.get(role=MembershipRole.OWNER).user


def _gate_denied(response) -> bool:
    return (
        response.status_code == 403
        and response.json().get("error", {}).get("code") == "auth.role_forbidden"
    )


def _add(api_client, **overrides):
    body = {"full_name": "Ayşe Mutfak", "email": "ayse@a.example", "role": "kitchen"}
    body.update(overrides)
    return api_client.post(TEAM, body, format="json")


@pytest.fixture
def owner_client(api_client, org_a):
    api_client.force_login(_owner(org_a))
    return api_client


# ------------------------------------------------------------------ the helper


def test_temporary_passwords_are_ten_unambiguous_characters():
    assert not set("0O1lI") & set(TEMP_PASSWORD_ALPHABET)
    for _ in range(50):
        password = generate_temporary_password()
        assert len(password) == 10
        assert set(password) <= set(TEMP_PASSWORD_ALPHABET)
    assert generate_temporary_password() != generate_temporary_password()


# ------------------------------------------------------------------ list / add


def test_owner_lists_the_team(owner_client, org_a):
    response = owner_client.get(TEAM)
    assert response.status_code == 200, response.content
    rows = response.json()["data"]
    assert [row["email"] for row in rows] == ["owner-a@example.com"]
    assert rows[0]["role"] == "owner"
    assert rows[0]["is_active"] is True


@pytest.mark.parametrize("role", ["manager", "staff", "kitchen"])
def test_only_the_owner_reaches_the_team_api(api_client, django_user_model, org_a, role):
    user = django_user_model.objects.create_user(email=f"{role}@a.example", password="x")
    Membership.objects.create(user=user, organization=org_a, role=role)
    api_client.force_login(user)
    assert _gate_denied(api_client.get(TEAM))
    assert _gate_denied(_add(api_client))


def test_owner_adds_a_kitchen_user_with_a_temporary_password(owner_client, org_a, django_user_model):
    response = _add(owner_client)
    assert response.status_code == 201, response.content
    data = response.json()["data"]
    password = data["temporary_password"]
    assert re.fullmatch(r"[A-Za-z0-9]{10}", password)
    assert data["member"]["email"] == "ayse@a.example"
    assert data["member"]["role"] == "kitchen"
    assert data["member"]["must_change_password"] is True

    user = django_user_model.objects.get(email="ayse@a.example")
    assert user.must_change_password is True
    assert user.check_password(password)
    membership = Membership.objects.get(user=user, organization=org_a)
    assert membership.role == MembershipRole.KITCHEN
    assert membership.is_active is True

    # The new account can sign in and is told to change the password.
    fresh = APIClient()
    login = fresh.post(
        "/api/v1/auth/login", {"email": "ayse@a.example", "password": password}, format="json"
    )
    assert login.status_code == 200
    assert login.json()["data"]["membership_role"] == "kitchen"
    assert login.json()["data"]["must_change_password"] is True


def test_adding_a_member_writes_an_audit_event(owner_client, org_a):
    _add(owner_client)
    event = AuditEvent.objects.filter(organization=org_a, target_type="membership").latest("id")
    assert event.action == "created"
    assert event.actor == _owner(org_a)
    assert "ayse@a.example" in event.target_repr
    assert "temporary_password" not in str(event.payload)


@pytest.mark.parametrize(
    ("overrides", "status", "code"),
    [
        ({"email": ""}, 400, "team.invalid_email"),
        ({"email": "not-an-email"}, 400, "team.invalid_email"),
        ({"role": "owner"}, 400, "team.invalid_role"),
        ({"role": "agency_admin"}, 400, "team.invalid_role"),
        ({"role": "wizard"}, 400, "team.invalid_role"),
        ({"email": "owner-a@example.com"}, 409, "team.email_in_use"),
        ({"email": "OWNER-A@example.com"}, 409, "team.email_in_use"),
    ],
)
def test_adding_a_member_validates_the_input(owner_client, overrides, status, code):
    response = _add(owner_client, **overrides)
    assert response.status_code == status, response.content
    assert response.json()["error"]["code"] == code


def test_email_of_a_user_in_another_business_is_refused(owner_client, org_b):
    response = _add(owner_client, email="owner-b@example.com")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "team.email_in_use"


# --------------------------------------------------------------------- update


def _create(owner_client, **overrides) -> dict:
    return _add(owner_client, **overrides).json()["data"]["member"]


def test_owner_changes_a_role(owner_client):
    member = _create(owner_client, role="staff")
    response = owner_client.patch(f"{TEAM}{member['id']}/", {"role": "manager"}, format="json")
    assert response.status_code == 200, response.content
    assert response.json()["data"]["role"] == "manager"


def test_owner_cannot_promote_to_owner(owner_client):
    member = _create(owner_client)
    response = owner_client.patch(f"{TEAM}{member['id']}/", {"role": "owner"}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "team.invalid_role"


def test_owner_cannot_modify_themselves_or_another_owner(owner_client, org_a, django_user_model):
    own = org_a.memberships.get(role=MembershipRole.OWNER)
    response = owner_client.patch(f"{TEAM}{own.id}/", {"is_active": False}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "team.cannot_modify_self"

    second_owner = django_user_model.objects.create_user(email="co@a.example", password="x")
    other = Membership.objects.create(user=second_owner, organization=org_a, role=MembershipRole.OWNER)
    response = owner_client.patch(f"{TEAM}{other.id}/", {"role": "staff"}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "team.owner_locked"


def test_deactivated_member_loses_access_and_can_be_reactivated(owner_client, org_a):
    created = _add(owner_client, role="staff").json()["data"]
    member_id = created["member"]["id"]
    member_client = APIClient()
    member_client.post(
        "/api/v1/auth/login",
        {"email": "ayse@a.example", "password": created["temporary_password"]},
        format="json",
    )
    assert member_client.get("/api/v1/admin/orders/").status_code == 200

    off = owner_client.patch(f"{TEAM}{member_id}/", {"is_active": False}, format="json")
    assert off.status_code == 200
    assert off.json()["data"]["is_active"] is False
    blocked = member_client.get("/api/v1/admin/orders/")
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "auth.no_membership"
    event = AuditEvent.objects.filter(organization=org_a, target_type="membership").latest("id")
    assert event.action == "deactivated"

    on = owner_client.patch(f"{TEAM}{member_id}/", {"is_active": True}, format="json")
    assert on.status_code == 200
    assert member_client.get("/api/v1/admin/orders/").status_code == 200
    event = AuditEvent.objects.filter(organization=org_a, target_type="membership").latest("id")
    assert event.action == "reactivated"


def test_update_with_nothing_to_change_is_a_400(owner_client):
    member = _create(owner_client)
    response = owner_client.patch(f"{TEAM}{member['id']}/", {}, format="json")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "team.nothing_to_update"


def test_a_member_of_another_business_is_a_404(owner_client, org_b, django_user_model):
    stranger = django_user_model.objects.create_user(email="s@b.example", password="x")
    foreign = Membership.objects.create(user=stranger, organization=org_b, role=MembershipRole.STAFF)
    assert owner_client.patch(f"{TEAM}{foreign.id}/", {"role": "manager"}, format="json").status_code == 404
    assert owner_client.post(f"{TEAM}{foreign.id}/reset-password/").status_code == 404


# ------------------------------------------------------------- reset password


def test_reset_password_issues_a_new_temporary_password_and_drops_old_sessions(owner_client, org_a):
    created = _add(owner_client, role="staff").json()["data"]
    member_id = created["member"]["id"]
    old_password = created["temporary_password"]
    member_client = APIClient()
    member_client.post(
        "/api/v1/auth/login", {"email": "ayse@a.example", "password": old_password}, format="json"
    )
    assert member_client.get("/api/v1/me").status_code == 200

    response = owner_client.post(f"{TEAM}{member_id}/reset-password/")
    assert response.status_code == 200, response.content
    new_password = response.json()["data"]["temporary_password"]
    assert new_password != old_password
    assert response.json()["data"]["member"]["must_change_password"] is True

    # Old session is gone, old password no longer works, the new one does.
    assert member_client.get("/api/v1/me").status_code in (401, 403)
    fresh = APIClient()
    assert fresh.post("/api/v1/auth/login", {"email": "ayse@a.example", "password": old_password}, format="json").status_code == 401
    assert fresh.post("/api/v1/auth/login", {"email": "ayse@a.example", "password": new_password}, format="json").status_code == 200
    event = AuditEvent.objects.filter(organization=org_a, target_type="membership").latest("id")
    assert event.action == "updated"
    assert event.payload.get("change") == "password_reset"
    assert new_password not in str(event.payload)


def test_owner_cannot_reset_their_own_or_another_owners_password(owner_client, org_a):
    own = org_a.memberships.get(role=MembershipRole.OWNER)
    response = owner_client.post(f"{TEAM}{own.id}/reset-password/")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "team.cannot_modify_self"


def test_platform_admin_without_a_business_gets_a_clear_refusal(api_client, admin_user):
    api_client.force_login(admin_user)
    response = api_client.get(TEAM)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "team.no_organization"
