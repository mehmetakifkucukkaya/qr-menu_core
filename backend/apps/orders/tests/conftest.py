"""Shared fixtures for the orders test suite (Sprint 8A — D-022).

Reuses ``api_client`` / ``org_a`` / ``org_b`` / ``admin_user`` from the
root ``conftest.py``. Adds a few convenience fixtures:

* :func:`branch_a` — an active branch under org_a.
* :func:`menu_a` — an active menu under org_a (branch-bound).
* :func:`category_a` — a single category inside ``menu_a``.
* :func:`item_a` / :func:`item_b` / :func:`item_unavailable` /
  :func:`item_inactive` — menu items with controlled availability flags.
* :func:`order_a` — a pre-created pending order for transition tests.
* :func:`reset_audit_context` (autouse) — clears the thread-local audit
  context between tests so actor / IP don't leak.

Fixtures avoid ``TransactionTestCase`` \u2014 Django wraps each test in its
own transaction (via the ``pytest.mark.django_db`` mark) and rolls back
on teardown. This is sufficient for our write-then-read pattern.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.audit.context import _local, clear


@pytest.fixture(autouse=True)
def _reset_audit_context():
    """Clear the audit thread-local between tests."""
    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")
    yield
    clear()
    if hasattr(_local, "_audit_snapshot"):
        delattr(_local, "_audit_snapshot")


@pytest.fixture
def branch_a(org_a):
    """An active branch under org_a."""
    from apps.branches.models import Branch

    return Branch.objects.create(
        organization=org_a,
        name="Merkez",
        slug="merkez",
        is_active=True,
    )


@pytest.fixture
def menu_a(org_a, branch_a):
    """An active menu (branch-bound) under org_a."""
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
    """A single category inside ``menu_a``."""
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
    """An available / active item priced at 45.00 TRY."""
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


@pytest.fixture
def item_b(category_a, menu_a):
    """Second available item priced at 30.00 TRY."""
    from apps.menu.models import MenuItem

    return MenuItem.objects.create(
        menu=menu_a,
        category=category_a,
        name="Çay",
        price=Decimal("30.00"),
        currency="TRY",
        is_active=True,
        is_available=True,
    )


@pytest.fixture
def item_unavailable(category_a, menu_a):
    """Active item flagged ``is_available=False`` (sold-out toggle)."""
    from apps.menu.models import MenuItem

    return MenuItem.objects.create(
        menu=menu_a,
        category=category_a,
        name="Limonata (tükendi)",
        price=Decimal("65.00"),
        currency="TRY",
        is_active=True,
        is_available=False,
    )


@pytest.fixture
def item_inactive(category_a, menu_a):
    """Item with ``is_active=False`` (operator removed from menu)."""
    from apps.menu.models import MenuItem

    return MenuItem.objects.create(
        menu=menu_a,
        category=category_a,
        name="Eski Menü Öğesi",
        price=Decimal("20.00"),
        currency="TRY",
        is_active=False,
        is_available=True,
    )


@pytest.fixture
def order_a(org_a, branch_a, menu_a, item_a):
    """A pending order under org_a with one item line."""
    from apps.orders.models import Order, OrderItem

    order = Order.objects.create(
        organization=org_a,
        branch=branch_a,
        menu=menu_a,
        order_number="CA-20260101-001",
        customer_name="Ali",
        customer_phone="+905320000001",
        total_amount=Decimal("45.00"),
        currency="TRY",
        status="pending",
    )
    OrderItem.objects.create(
        order=order,
        menu_item=item_a,
        name=item_a.name,
        price=item_a.price,
        quantity=1,
    )
    return order
