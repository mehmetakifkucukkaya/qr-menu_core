"""Shared fixtures for the account test suite — Sprint 10A (D-025).

Reuses the root ``conftest.py`` fixtures (``api_client``, ``org_a``,
``org_b``, ``admin_user``) and adds account-specific helpers.

Two autouse fixtures:

* :func:`_clear_throttle_cache` — reset DRF's cache between tests.
  The magic-link request endpoint is throttled at 5/hour; without
  this, an exhausted bucket would block re-runs of any auth test.

* :func:`_reset_audit_context` — mirror of the orders' fixture,
  clearing the audit thread-local so the ``actor`` field doesn't
  leak across tests.
"""

from __future__ import annotations

import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Reset DRF's cache between tests (see translate/orders conftest)."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _reset_audit_context():
    """Clear the audit thread-local between tests."""
    from apps.audit.context import _local, clear

    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")
    yield
    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")


@pytest.fixture
def auth_user_a(django_user_model):
    """Owner of ``org_a`` — alias for the user created by the root fixture."""
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="owner-a@example.com")
