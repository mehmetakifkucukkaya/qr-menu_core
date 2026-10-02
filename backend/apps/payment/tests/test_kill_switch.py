"""Platform-wide payments kill switch — ANALYSIS_1 F-06.

The payment module has no UI yet (checkout has no payment step) but its API
was live and anonymously reachable, and its webhook / refund code was broken.
``settings.PAYMENTS_ENABLED`` (env ``PAYMENTS_ENABLED``, default OFF) keeps the
whole surface dark until the checkout ships: every payment route answers 404
and the ``payments_enabled`` feature flag reports False for every tenant, so
the storefront falls back to "pay cash at the venue".
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.billing import services as billing_services

pytestmark = pytest.mark.django_db


def _payment_urls():
    """Every route of the payment app, with dummy values for path parameters."""
    from apps.payment import urls as payment_urls

    out = []
    for pattern in payment_urls.urlpatterns:
        route = str(pattern.pattern)
        route = route.replace("<str:order_number>", "X-1").replace("<str:provider_name>", "stripe")
        out.append("/api/v1/payment/" + route)
    return out


PAYMENT_URLS = _payment_urls()


def test_the_route_list_covers_the_whole_payment_app():
    assert len(PAYMENT_URLS) >= 10  # pay, status, webhook, 6 admin routes, dashboard


@pytest.mark.parametrize("url", PAYMENT_URLS)
def test_every_payment_route_is_404_while_payments_are_off(settings, user_a, url):
    settings.PAYMENTS_ENABLED = False

    anonymous = APIClient().get(url)
    member = APIClient()
    member.force_authenticate(user=user_a)
    logged_in = member.get(url)

    for response in (anonymous, logged_in):
        assert response.status_code == 404, f"{url} -> {response.status_code}"
        assert response.json()["code"] == "payment.disabled"


def test_webhook_post_is_404_while_payments_are_off(settings):
    settings.PAYMENTS_ENABLED = False
    res = APIClient().post(
        "/api/v1/payment/webhooks/stripe/", data=b"{}", content_type="application/json"
    )
    assert res.status_code == 404


def test_default_is_off():
    """Not overridden anywhere but the test settings, which switch it on."""
    from pathlib import Path

    base = (Path(__file__).resolve().parents[3] / "config" / "settings" / "base.py").read_text()
    assert '_env_bool("PAYMENTS_ENABLED", default=False)' in base


# --- the feature flag the storefront reads ----------------------------------


def test_flag_is_forced_off_even_when_the_plan_row_says_on(settings, org_a):
    settings.PAYMENTS_ENABLED = False
    ps = billing_services.get_plan_settings(org_a)
    ps.payments_enabled = True
    ps.save()

    assert billing_services.has_feature(org_a, "payments_enabled") is False
    assert ps.effective_features()["payments_enabled"] is False
    public = billing_services.get_public_settings(org_a)
    assert public["features"]["payments_enabled"] is False
    # Only payments is switched: the rest of the plan is untouched.
    assert public["features"]["cart_enabled"] is True


def test_flag_follows_the_plan_when_payments_are_on(settings, org_a):
    settings.PAYMENTS_ENABLED = True
    ps = billing_services.get_plan_settings(org_a)  # lazily created as OPS
    assert ps.payments_enabled is True

    assert billing_services.has_feature(org_a, "payments_enabled") is True
    assert billing_services.get_public_settings(org_a)["features"]["payments_enabled"] is True


def test_public_settings_endpoint_reports_payments_off(settings, org_a, api_client):
    settings.PAYMENTS_ENABLED = False
    res = api_client.get(f"/api/v1/public/settings/{org_a.slug}/")
    assert res.status_code == 200
    body = res.json()
    features = body.get("data", body)["features"]
    assert features["payments_enabled"] is False
