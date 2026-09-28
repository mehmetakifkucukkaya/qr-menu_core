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

Order fixtures
--------------
We re-provide ``branch_a`` / ``menu_a`` / ``category_a`` / ``item_a``
locally so loyalty tests don't need to drag in
``apps/orders/tests/conftest.py``. The orders app's conftest only
loads when tests run from inside that directory — re-providing keeps
the test happy under our own pytest root.
"""

from __future__ import annotations

from decimal import Decimal

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


# ---------------------------------------------------------------------------
# Order fixtures (mirror of apps/orders/tests/conftest.py — keep tests
# self-contained).
# ---------------------------------------------------------------------------
@pytest.fixture
def branch_a(org_a):
    from apps.branches.models import Branch

    return Branch.objects.create(
        organization=org_a,
        name="Merkez",
        slug="merkez",
        is_active=True,
    )


@pytest.fixture
def menu_a(org_a, branch_a):
    from apps.menu.models import Menu

    return Menu.objects.create(
        organization=org_a,
        branch=branch_a,
        name="Ana Menü",
        default_locale="tr",
        supported_locales=["tr"],
        is_active=True,
    )


@pytest.fixture
def category_a(menu_a):
    from apps.menu.models import MenuCategory

    return MenuCategory.objects.create(
        menu=menu_a,
        name="Sıcak İçecekler",
        slug="sicak-icecekler",
        sort_order=0,
        is_active=True,
    )


@pytest.fixture
def item_a(category_a, menu_a):
    from apps.menu.models import MenuItem

    return MenuItem.objects.create(
        menu=menu_a,
        category=category_a,
        name="Türk Kahvesi",
        price=Decimal("45.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )

