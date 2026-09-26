"""Auth endpoint tests — login, me, logout, CSRF."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_csrf_endpoint_returns_token(api_client):
    """GET /api/v1/auth/csrf → returns csrfToken in JSON."""
    response = api_client.get("/api/v1/auth/csrf")
    assert response.status_code == 200
    assert "csrfToken" in response.json()
    assert response.json()["csrfToken"]


def test_login_success_returns_user(api_client, admin_user):
    """POST /api/v1/auth/login with valid creds → 200 + user payload."""
    response = api_client.post(
        "/api/v1/auth/login",
        data={"email": admin_user.email, "password": "test-pass-123"},
        format="json",
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["email"] == admin_user.email
    assert payload["data"]["role"] == "admin"


def test_login_invalid_password_returns_401(api_client, admin_user):
    """Wrong password → 401 with error envelope."""
    response = api_client.post(
        "/api/v1/auth/login",
        data={"email": admin_user.email, "password": "wrong-password"},
        format="json",
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "auth.invalid_credentials"


def test_login_missing_fields_returns_400(api_client):
    """Empty body → 400."""
    response = api_client.post("/api/v1/auth/login", data={}, format="json")
    assert response.status_code == 400


def test_me_requires_auth(api_client):
    """GET /api/v1/me without auth → 403 (default DRF auth required)."""
    response = api_client.get("/api/v1/me")
    assert response.status_code in (401, 403)


def test_me_returns_current_user(api_client, admin_user):
    """Login then GET /api/v1/me → 200 with user JSON."""
    api_client.post(
        "/api/v1/auth/login",
        data={"email": admin_user.email, "password": "test-pass-123"},
        format="json",
    )
    response = api_client.get("/api/v1/me")
    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["email"] == admin_user.email


def test_logout_clears_session(api_client, admin_user):
    """Login → /me works; logout → /me stops working."""
    api_client.post(
        "/api/v1/auth/login",
        data={"email": admin_user.email, "password": "test-pass-123"},
        format="json",
    )
    me_ok = api_client.get("/api/v1/me")
    assert me_ok.status_code == 200

    logout_resp = api_client.post("/api/v1/auth/logout")
    assert logout_resp.status_code == 204

    me_after = api_client.get("/api/v1/me")
    assert me_after.status_code in (401, 403)
