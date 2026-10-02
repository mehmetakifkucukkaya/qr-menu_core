"""Throttling behind a proxy and for the Next.js SSR caller — ANALYSIS_1 F-05.

Two problems are pinned here:

1. **One shared bucket for the whole platform.** The Next.js server renders
   every public menu by calling Django from a single IP and does not forward
   the visitor's address, so DRF's per-IP ``anon`` throttle (60/min) counted
   *all* visitors of *all* businesses together: the 61st page view in a
   minute was an error page. The SSR caller now authenticates with a shared
   secret header (``X-Internal-Token``) and is exempt from the read-endpoint
   throttles; browsers and the write endpoints stay limited per client.

2. **Spoofable client identity.** With ``NUM_PROXIES`` unset DRF keys the
   throttle on the *whole* ``X-Forwarded-For`` string, so a client rotates
   the header and never hits the limit. In production the one trusted hop is
   Caddy, so ``NUM_PROXIES = 1`` makes DRF use the address Caddy appended.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle

pytestmark = pytest.mark.django_db

TOKEN = "unit-test-internal-token-0123456789"
MENU_URL = "/api/v1/public/menus/no-such-business"
SETTINGS_URL = "/api/v1/public/settings/no-such-business/"
ORDERS_URL = "/api/v1/public/orders"


@pytest.fixture(autouse=True)
def _fresh_throttle_state(monkeypatch):
    cache.clear()
    # DRF reads the rate table once at import; patch the live dict, restored
    # automatically after each test.
    for scope, rate in {
        "anon": "3/min",
        "public_settings": "3/min",
        "public_orders": "3/min",
    }.items():
        monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, scope, rate)
    yield
    cache.clear()


def _hammer(url, n, *, token=None, ip="10.0.0.1", method="get"):
    client = APIClient()
    extra = {"REMOTE_ADDR": ip}
    if token is not None:
        extra["HTTP_X_INTERNAL_TOKEN"] = token
    send = getattr(client, method)
    return [send(url, **extra).status_code for _ in range(n)]


# ---------------------------------------------------------------------------
# Baseline: visitors are limited per client
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("url", [MENU_URL, SETTINGS_URL])
def test_anonymous_visitor_is_throttled_after_the_limit(url):
    codes = _hammer(url, 5)
    assert codes[:3] == [404, 404, 404]  # unknown business, but counted
    assert codes[3:] == [429, 429]


def test_a_second_visitor_has_their_own_bucket():
    assert 429 in _hammer(MENU_URL, 5, ip="10.0.0.1")
    assert _hammer(MENU_URL, 3, ip="10.0.0.2") == [404, 404, 404]


# ---------------------------------------------------------------------------
# The SSR caller (trusted shared secret) is not subject to the read throttles
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("url", [MENU_URL, SETTINGS_URL])
def test_ssr_caller_with_the_internal_token_is_never_throttled(settings, url):
    settings.INTERNAL_API_TOKEN = TOKEN

    codes = _hammer(url, 12, token=TOKEN)

    assert 429 not in codes
    assert set(codes) == {404}


@pytest.mark.parametrize("url", [MENU_URL, SETTINGS_URL])
def test_wrong_internal_token_gets_no_exemption(settings, url):
    settings.INTERNAL_API_TOKEN = TOKEN

    codes = _hammer(url, 6, token="not-the-token")

    assert codes[3:] == [429, 429, 429]


def test_empty_server_token_never_matches_an_empty_header(settings):
    """A deployment that did not set the secret must not be exempt-by-default."""
    settings.INTERNAL_API_TOKEN = ""

    assert 429 in _hammer(MENU_URL, 6, token="")


def test_internal_token_does_not_exempt_the_order_write_endpoint(settings):
    """The secret only relaxes read endpoints the SSR server calls."""
    settings.INTERNAL_API_TOKEN = TOKEN

    codes = _hammer(ORDERS_URL, 6, token=TOKEN, method="post")

    assert 429 in codes


# ---------------------------------------------------------------------------
# Client identity behind the reverse proxy
# ---------------------------------------------------------------------------
def _ident(settings_override, xff):
    from rest_framework.settings import api_settings  # noqa: F401  (reload hook)

    request = APIRequestFactory().get(
        "/", HTTP_X_FORWARDED_FOR=xff, REMOTE_ADDR="172.18.0.5"
    )
    return AnonRateThrottle().get_ident(request)


def test_without_num_proxies_a_client_can_rotate_the_forwarded_for_header(settings):
    """The old behaviour: the whole header is the key, so it is spoofable."""
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": None}

    a = _ident(settings, "6.6.6.6, 203.0.113.9")
    b = _ident(settings, "7.7.7.7, 203.0.113.9")

    assert a != b


def test_num_proxies_one_keys_on_the_address_the_proxy_appended(settings):
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}

    a = _ident(settings, "6.6.6.6, 203.0.113.9")
    b = _ident(settings, "7.7.7.7, 203.0.113.9")

    assert a == b == "203.0.113.9"


def test_production_settings_trust_exactly_one_proxy_hop():
    src = (Path(__file__).resolve().parents[1] / "config" / "settings" / "production.py").read_text()
    assert re.search(r"\"NUM_PROXIES\"\s*:", src), (
        "production.py must set REST_FRAMEWORK['NUM_PROXIES'] (Caddy is the one trusted hop)"
    )
