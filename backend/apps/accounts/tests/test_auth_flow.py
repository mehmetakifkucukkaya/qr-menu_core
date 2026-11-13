"""Sign-in payloads, per-role session length, suspended-tenant refusal and the
password-change endpoint (SPEC_PILOT_READINESS §3.3)."""

from __future__ import annotations

import pytest
from django.urls import reverse

from apps.accounts.models import Membership, MembershipRole

pytestmark = pytest.mark.django_db

PASSWORD = "Gizli-Sifre-2026!"


def _make_member(django_user_model, org, role, email="member@a.example", **extra):
    user = django_user_model.objects.create_user(
        email=email, password=PASSWORD, role="staff", **extra
    )
    Membership.objects.create(user=user, organization=org, role=role)
    return user


def _login(api_client, email, password=PASSWORD):
    return api_client.post(reverse("auth-login"), {"email": email, "password": password}, format="json")


def test_login_and_me_report_the_membership_role(api_client, django_user_model, org_a):
    _make_member(django_user_model, org_a, MembershipRole.KITCHEN, "kitchen@a.example")

    response = _login(api_client, "kitchen@a.example")
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    assert data["membership_role"] == "kitchen"
    assert data["must_change_password"] is False

    me = api_client.get("/api/v1/me").json()["data"]
    assert me["membership_role"] == "kitchen"
    assert me["must_change_password"] is False


def test_must_change_password_is_reported(api_client, django_user_model, org_a):
    _make_member(
        django_user_model, org_a, MembershipRole.STAFF, "new@a.example", must_change_password=True
    )
    data = _login(api_client, "new@a.example").json()["data"]
    assert data["must_change_password"] is True


def test_platform_admin_without_membership_can_sign_in(api_client, admin_user):
    response = _login(api_client, "admin@example.com", "test-pass-123")
    assert response.status_code == 200
    assert response.json()["data"]["membership_role"] is None


@pytest.mark.parametrize(
    ("role", "days"),
    [
        (MembershipRole.OWNER, 14),
        (MembershipRole.MANAGER, 14),
        (MembershipRole.STAFF, 30),
        (MembershipRole.KITCHEN, 30),
    ],
)
def test_session_length_depends_on_the_role(api_client, django_user_model, org_a, role, days):
    _make_member(django_user_model, org_a, role, "who@a.example")
    assert _login(api_client, "who@a.example").status_code == 200
    assert api_client.session.get_expiry_age() == days * 24 * 3600


def test_sessions_slide_with_activity(settings):
    assert settings.SESSION_SAVE_EVERY_REQUEST is True


def test_member_of_a_suspended_business_cannot_sign_in(api_client, django_user_model, org_a):
    _make_member(django_user_model, org_a, MembershipRole.OWNER, "boss@a.example")
    org_a.is_active = False
    org_a.save(update_fields=["is_active"])

    response = _login(api_client, "boss@a.example")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "tenant.suspended"
    assert "sessionid" not in api_client.cookies and "qr_sessionid" not in api_client.cookies


def test_user_without_any_membership_cannot_sign_in(api_client, django_user_model):
    django_user_model.objects.create_user(email="lonely@example.com", password=PASSWORD)
    response = _login(api_client, "lonely@example.com")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.no_membership"


def test_wrong_password_is_still_a_plain_401(api_client, django_user_model, org_a):
    _make_member(django_user_model, org_a, MembershipRole.OWNER, "boss@a.example")
    response = _login(api_client, "boss@a.example", "yanlis")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "auth.invalid_credentials"


# ------------------------------------------------------------ password change

CHANGE_URL = "/api/v1/auth/password/change"


def test_password_change_requires_a_session(api_client):
    response = api_client.post(CHANGE_URL, {"current_password": "a", "new_password": "b"}, format="json")
    assert response.status_code in (401, 403)


def test_password_change_happy_path_clears_the_flag_and_keeps_the_session(
    api_client, django_user_model, org_a
):
    user = _make_member(
        django_user_model, org_a, MembershipRole.STAFF, "new@a.example", must_change_password=True
    )
    _login(api_client, "new@a.example")

    response = api_client.post(
        CHANGE_URL,
        {"current_password": PASSWORD, "new_password": "Yepyeni-Sifre-77!"},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["data"] == {"ok": True}

    user.refresh_from_db()
    assert user.must_change_password is False
    assert user.check_password("Yepyeni-Sifre-77!")
    # The browser stays signed in...
    assert api_client.get("/api/v1/me").status_code == 200
    # ...and the old password no longer works.
    api_client.post(reverse("auth-logout"))
    assert _login(api_client, "new@a.example").status_code == 401
    assert _login(api_client, "new@a.example", "Yepyeni-Sifre-77!").status_code == 200


def test_password_change_rejects_a_wrong_current_password(api_client, django_user_model, org_a):
    user = _make_member(django_user_model, org_a, MembershipRole.STAFF, "new@a.example")
    _login(api_client, "new@a.example")
    response = api_client.post(
        CHANGE_URL, {"current_password": "yanlis", "new_password": "Yepyeni-Sifre-77!"}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "auth.invalid_current_password"
    user.refresh_from_db()
    assert user.check_password(PASSWORD)


def test_password_change_enforces_the_password_rules(api_client, django_user_model, org_a):
    _make_member(django_user_model, org_a, MembershipRole.STAFF, "new@a.example")
    _login(api_client, "new@a.example")
    response = api_client.post(
        CHANGE_URL, {"current_password": PASSWORD, "new_password": "12345678"}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "auth.password_invalid"


def test_password_change_rejects_reusing_the_current_password(api_client, django_user_model, org_a):
    _make_member(django_user_model, org_a, MembershipRole.STAFF, "new@a.example")
    _login(api_client, "new@a.example")
    response = api_client.post(
        CHANGE_URL, {"current_password": PASSWORD, "new_password": PASSWORD}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "auth.password_unchanged"
