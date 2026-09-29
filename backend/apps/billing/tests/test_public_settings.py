"""Public settings endpoint tests — Sprint B3 (D-028 follow-up).

Covers:

* Unknown / inactive slug → 404
* OPS plan → all 8 features True
* BASIC plan → all 8 features False
* Manual override respected (OPS plan with cart_enabled=False override)
* Internal fields (billing_notes, id, updated_at) never leak
* Throttle is configured (AnonRateThrottle scope == 'public_settings')
* All 4 plan tiers renderable
"""

from __future__ import annotations

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from apps.billing.constants import FEATURE_FIELDS, PLAN_CHOICES


pytestmark = pytest.mark.django_db


def _settings_url(slug: str) -> str:
    return reverse("public-billing-settings", kwargs={"slug": slug})


def test_unknown_slug_returns_404():
    client = APIClient()
    resp = client.get(_settings_url("nope-cafe"))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "public.tenant_not_found"


def test_inactive_slug_returns_404(org_a):
    org_a.is_active = False
    org_a.save(update_fields=["is_active"])
    client = APIClient()
    resp = client.get(_settings_url(org_a.slug))
    assert resp.status_code == 404


def test_ops_plan_all_features_true(org_a, make_plan_settings):
    """org_a has a PlanSettings row lazily created on first read — force it
    to OPS and confirm all 8 features flip True."""
    make_plan_settings(org_a, plan="ops")

    client = APIClient()
    resp = client.get(_settings_url(org_a.slug))
    assert resp.status_code == 200
    payload = resp.json()["data"]
    assert payload["active_plan"] == "ops"
    assert payload["slug"] == org_a.slug
    assert all(payload["features"][f] is True for f in FEATURE_FIELDS)


def test_basic_plan_all_features_false(basic_org):
    client = APIClient()
    resp = client.get(_settings_url(basic_org.slug))
    assert resp.status_code == 200
    payload = resp.json()["data"]
    assert payload["active_plan"] == "basic"
    assert all(payload["features"][f] is False for f in FEATURE_FIELDS)


def test_manual_override_takes_precedence(org_a, make_plan_settings):
    """Operator can flip a single flag off on OPS — override wins."""
    make_plan_settings(org_a, plan="ops", features={"cart_enabled": False})

    client = APIClient()
    resp = client.get(_settings_url(org_a.slug))
    assert resp.status_code == 200
    payload = resp.json()["data"]
    assert payload["active_plan"] == "ops"
    assert payload["features"]["cart_enabled"] is False
    # Other OPS defaults stay True
    assert payload["features"]["orders_enabled"] is True


def test_internal_fields_not_exposed(org_a, make_plan_settings):
    """``billing_notes`` + ``id`` + ``updated_at`` MUST NOT appear in payload."""
    make_plan_settings(
        org_a,
        plan="ops",
        billing_notes="coupon-XYZ operator override",
    )

    client = APIClient()
    resp = client.get(_settings_url(org_a.slug))
    payload = resp.json()["data"]
    raw_json = resp.content.decode()

    assert "billing_notes" not in payload
    assert "coupon-XYZ" not in raw_json
    assert "id" not in payload  # PlanSettings.id should not leak
    assert "updated_at" not in payload
    # Strict allow-list: only these 4 keys at top level
    assert set(payload.keys()) == {"slug", "name", "active_plan", "features"}


def test_endpoint_anonymous_and_throttled(org_a, make_plan_settings):
    """No auth required + throttle scope configured."""
    make_plan_settings(org_a, plan="ops")

    client = APIClient(enforce_csrf_checks=False)
    resp = client.get(_settings_url(org_a.slug))
    assert resp.status_code == 200

    from apps.billing.views import PublicSettingsThrottle

    assert PublicSettingsThrottle.scope == "public_settings"


def test_all_plan_choices_renderable(make_plan_settings):
    """Sanity: each of the 4 plan tiers produces a valid response."""
    from apps.accounts.models import Membership, MembershipRole
    from django.contrib.auth import get_user_model
    from apps.organizations.models import Organization

    User = get_user_model()

    for plan_key, _label in PLAN_CHOICES:
        slug = f"cafe-{plan_key}"
        user = User.objects.create_user(
            email=f"owner-{plan_key}@example.com",
            password="x",
            role="owner",
        )
        org = Organization.objects.create(
            name=f"{plan_key.title()} Cafe",
            slug=slug,
            default_locale="tr",
            supported_locales=["tr", "en"],
            currency="TRY",
            is_active=True,
        )
        Membership.objects.create(
            user=user, organization=org, role=MembershipRole.OWNER
        )
        make_plan_settings(org, plan=plan_key)

        client = APIClient()
        resp = client.get(_settings_url(slug))
        assert resp.status_code == 200, plan_key
        payload = resp.json()["data"]
        assert payload["active_plan"] == plan_key
        # features dict must contain all 8 keys regardless of tier
        assert set(payload["features"].keys()) == set(FEATURE_FIELDS)


def test_get_public_settings_service_unit(org_a, make_plan_settings):
    """Direct service call — bypasses HTTP, verifies function contract."""
    from apps.billing.services import get_public_settings

    make_plan_settings(org_a, plan="ops")
    settings = get_public_settings(org_a)
    assert settings["active_plan"] == "ops"
    assert set(settings["features"].keys()) == set(FEATURE_FIELDS)
