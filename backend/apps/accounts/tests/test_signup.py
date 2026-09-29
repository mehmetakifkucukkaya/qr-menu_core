"""Sprint C1 — self-serve signup endpoint tests.

Covers the atomic User + Organization + Membership + PlanSettings(BASIC)
transaction + auto-login + slug uniqueness + email uniqueness + password
validation.
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.accounts.models import Membership, MembershipRole, User
from apps.billing.models import PlanSettings
from apps.organizations.models import Organization


pytestmark = pytest.mark.django_db


def _signup_url() -> str:
    return reverse("auth-signup")


def _check_slug_url() -> str:
    return reverse("auth-check-slug")


def _payload(**overrides):
    base = {
        "email": "new-owner@mycafe.example",
        "password": "S3cur3-Pass!",
        "full_name": "Cafe Owner",
        "business_name": "My Cafe",
        "slug": "my-cafe",
        "default_locale": "tr",
        "supported_locales": ["tr", "en"],
        "currency": "TRY",
    }
    base.update(overrides)
    return base


def test_signup_happy_path_creates_tenant_atomically():
    """Single POST → User + Organization + Membership(OWNER) + PlanSettings(BASIC)."""
    client = APIClient()
    resp = client.post(_signup_url(), _payload(), format="json")
    assert resp.status_code == 201, resp.content
    data = resp.json()["data"]
    assert data["user"]["email"] == "new-owner@mycafe.example"
    assert data["organization_slug"] == "my-cafe"
    assert data["plan"] == "basic"
    assert data["membership_role"] == MembershipRole.OWNER

    user = User.objects.get(email="new-owner@mycafe.example")
    org = Organization.objects.get(slug="my-cafe")
    assert Membership.objects.filter(user=user, organization=org, role=MembershipRole.OWNER).exists()
    ps = PlanSettings.objects.get(organization=org)
    assert ps.active_plan == "basic"
    assert ps.cart_enabled is False  # BASIC defaults
    assert ps.payments_enabled is False


def test_signup_auto_login_sets_session_cookie():
    """After signup the client should be authenticated (subsequent /me works)."""
    client = APIClient()
    resp = client.post(_signup_url(), _payload(), format="json")
    assert resp.status_code == 201
    # /me should work without re-login.
    me = client.get(reverse("auth-me"))
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "new-owner@mycafe.example"


def test_signup_duplicate_email_returns_400():
    """Email is case-insensitive unique."""
    User.objects.create_user(
        email="dup@mycafe.example", password="x", role="owner"
    )
    client = APIClient()
    resp = client.post(
        _signup_url(), _payload(email="DUP@mycafe.example"), format="json"
    )
    assert resp.status_code == 400
    assert "email" in resp.json()


def test_signup_duplicate_slug_returns_400():
    """Slug collision rejects signup (slug is the tenant URL key)."""
    Organization.objects.create(
        name="Existing Cafe",
        slug="taken-slug",
        default_locale="tr",
        supported_locales=["tr"],
        currency="TRY",
    )
    client = APIClient()
    resp = client.post(
        _signup_url(), _payload(slug="taken-slug"), format="json"
    )
    assert resp.status_code == 400
    assert "slug" in resp.json()


def test_signup_reserved_slug_returns_400():
    """Reserved slugs (admin/api/www/static/media/signup) cannot be claimed."""
    client = APIClient()
    for reserved in ["admin", "api", "www", "static", "media", "signup"]:
        resp = client.post(
            _signup_url(), _payload(slug=reserved, email=f"{reserved}@x.example"),
            format="json",
        )
        assert resp.status_code == 400, reserved
        assert "slug" in resp.json()


def test_signup_invalid_slug_format_returns_400():
    """Slug must be lowercase alphanumeric + hyphens, 1-40 chars."""
    client = APIClient()
    for bad in ["My Cafe", "Has Spaces", "-leading-hyphen", "trailing-hyphen-", "üñîçødé"]:
        resp = client.post(
            _signup_url(),
            _payload(slug=bad, email=f"{bad[:5].replace(' ', '')}@x.example"),
            format="json",
        )
        assert resp.status_code == 400, bad


def test_signup_weak_password_returns_400():
    """Django password validators reject common passwords."""
    client = APIClient()
    resp = client.post(
        _signup_url(), _payload(password="password"), format="json"
    )
    assert resp.status_code == 400
    assert "password" in resp.json()


def test_signup_default_locale_must_be_in_supported_locales():
    """If supported_locales=['en'], default_locale='tr' must fail."""
    client = APIClient()
    resp = client.post(
        _signup_url(),
        _payload(default_locale="tr", supported_locales=["en"]),
        format="json",
    )
    assert resp.status_code == 400
    assert "supported_locales" in resp.json()


def test_signup_supports_euro_currency():
    """EUR/USD/GBP currency accepted (V1 international support)."""
    client = APIClient()
    resp = client.post(
        _signup_url(), _payload(currency="EUR", email="euro@x.example", slug="euro-cafe"),
        format="json",
    )
    assert resp.status_code == 201
    org = Organization.objects.get(slug="euro-cafe")
    assert org.currency == "EUR"


def test_check_slug_returns_available_for_free_slug():
    client = APIClient()
    resp = client.get(_check_slug_url(), {"slug": "fresh-slug"})
    assert resp.status_code == 200
    assert resp.json()["data"]["available"] is True


def test_check_slug_returns_taken_for_existing_org():
    Organization.objects.create(
        name="X",
        slug="existing-slug",
        default_locale="tr",
        supported_locales=["tr"],
        currency="TRY",
    )
    client = APIClient()
    resp = client.get(_check_slug_url(), {"slug": "existing-slug"})
    assert resp.status_code == 200
    assert resp.json()["data"]["available"] is False
    assert resp.json()["data"]["reason"] == "taken"


def test_check_slug_reserved_returns_reason():
    client = APIClient()
    resp = client.get(_check_slug_url(), {"slug": "admin"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["available"] is False
    assert data["reason"] == "reserved"


def test_check_slug_invalid_format_returns_reason():
    client = APIClient()
    resp = client.get(_check_slug_url(), {"slug": "Has Spaces"})
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["available"] is False
    assert data["reason"] == "invalid"


def test_check_slug_empty_returns_not_available():
    client = APIClient()
    resp = client.get(_check_slug_url(), {"slug": ""})
    assert resp.status_code == 200
    assert resp.json()["data"]["available"] is False
    assert resp.json()["data"]["reason"] == "empty"
