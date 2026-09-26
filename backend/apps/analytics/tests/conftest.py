"""Shared fixtures for analytics tests.

Re-uses ``api_client`` / ``org_a`` / ``org_b`` from the root conftest and
adds a ``menu_a`` for FK targets. We also auto-clear the cache between
tests so the PublicEventsThrottle state (30/min counter) doesn't bleed.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache

from apps.menu.models import Menu


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def menu_a(org_a):
    return Menu.objects.create(
        organization=org_a,
        name="Ana Menü",
        description="",
        default_locale="tr",
        supported_locales=["tr", "en"],
        is_active=True,
    )
