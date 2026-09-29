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
    """Single POST → User + Organization + Membership(OWNER) +
    PlanSettings(BASIC → flipped to OPS trial by the C3b hook).
    """
    client = APIClient()
    resp = client.post(_signup_url(), _payload(), format="json")
    assert resp.status_code == 201, resp.content
    data = resp.json()["data"]
    assert data["user"]["email"] == "new-owner@mycafe.example"
    assert data["organization_slug"] == "my-cafe"
    # Sprint C3b: signup flips the fresh tenant into a 14-day OPS
    # trial — the API response still surfaces the BASIC plan that the
    # SignupSerializer was modelled on; the TrialBanner reads from the
    # /onboarding/trial-status/ endpoint instead.
    assert data["plan"] == "basic"
    assert data["membership_role"] == MembershipRole.OWNER

    user = User.objects.get(email="new-owner@mycafe.example")
    org = Organization.objects.get(slug="my-cafe")
    assert Membership.objects.filter(user=user, organization=org, role=MembershipRole.OWNER).exists()
    ps = PlanSettings.objects.get(organization=org)
    # Trial hook ran → plan is now OPS with all 8 features enabled.
    assert ps.active_plan == "ops"
    assert ps.cart_enabled is True
    assert ps.payments_enabled is True


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


# ---------------------------------------------------------------------------
# Sprint C3b — signup trial hook.
#
# SignupView calls ``onboarding.services.start_trial`` inside the same
# atomic transaction as User + Organization + PlanSettings. We assert:
#
#   1. The PlanSettings row ends up on ``ops`` (BASIC was the seed value,
#      ``start_trial`` re-writes it).
#   2. ``trial_started_at`` and ``trial_ends_at`` are populated and span
#      the canonical 14-day window.
#   3. ``is_in_trial`` returns True for the freshly signed-up tenant.
#   4. The hook is idempotent across multiple signups (each new tenant
#      gets its own trial window — there's no global toggle).
# ---------------------------------------------------------------------------


def test_signup_starts_14_day_ops_trial_window():
    """C3b hook: a successful POST /auth/signup/ opens a 14-day OPS trial."""
    from datetime import timedelta

    from django.utils import timezone
    from apps.onboarding.services import is_in_trial

    client = APIClient()
    resp = client.post(_signup_url(), _payload(), format="json")
    assert resp.status_code == 201, resp.content

    org = Organization.objects.get(slug="my-cafe")
    ps = PlanSettings.objects.get(organization=org)

    # Plan flips to OPS and the window opens.
    assert ps.active_plan == "ops"
    assert ps.trial_started_at is not None
    assert ps.trial_ends_at is not None
    # 14-day window — allow ±5s drift for the test DB clock skew.
    window = ps.trial_ends_at - ps.trial_started_at
    assert timedelta(days=14) - timedelta(seconds=5) <= window <= timedelta(days=14) + timedelta(seconds=5)

    # The helper still considers the tenant "in trial".
    assert is_in_trial(ps) is True

    # And trial_started_at is "now-ish" — i.e. the hook ran during the
    # POST, not at some unrelated time.
    drift = timezone.now() - ps.trial_started_at
    assert timedelta(0) <= drift <= timedelta(seconds=30)


def test_signup_trial_hook_creates_independent_windows_per_tenant():
    """Two signups → two independent trial windows (no shared state)."""
    from apps.onboarding.services import is_in_trial

    client = APIClient()
    payload_a = _payload()
    payload_b = _payload(
        email="owner-b@mycafe.example",
        slug="my-cafe-b",
        business_name="My Cafe B",
    )

    resp_a = client.post(_signup_url(), payload_a, format="json")
    resp_b = client.post(_signup_url(), payload_b, format="json")
    assert resp_a.status_code == 201, resp_a.content
    assert resp_b.status_code == 201, resp_b.content

    org_a = Organization.objects.get(slug="my-cafe")
    org_b = Organization.objects.get(slug="my-cafe-b")
    ps_a = PlanSettings.objects.get(organization=org_a)
    ps_b = PlanSettings.objects.get(organization=org_b)

    # Both windows are open + on OPS, but each org has its own row.
    assert is_in_trial(ps_a) is True
    assert is_in_trial(ps_b) is True
    assert ps_a.id != ps_b.id
