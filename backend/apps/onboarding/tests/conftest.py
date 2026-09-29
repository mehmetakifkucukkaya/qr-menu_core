"""Shared fixtures for onboarding tests — Sprint C3.

Adds Modern Cafe as a demo template (the import_demo_template service
copies from this organization). Uses pytest-django's ``db`` mark
transparently — fixture runs inside the same transactional test DB.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from apps.accounts.models import Membership, MembershipRole
from apps.accounts.models import User as AccountsUser
from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.organizations.models import Organization


@pytest.fixture
def user_a(org_a):
    """owner-a@example.com — the owner of org_a (top-level conftest defines
    ``org_a`` but not this convenience alias)."""
    from django.contrib.auth import get_user_model

    return get_user_model().objects.get(email="owner-a@example.com")


@pytest.fixture
def modern_cafe(db):
    """Create Modern Cafe + 5 categories + 25 items for demo-seed tests."""
    user = AccountsUser.objects.create(
        email="modern-cafe-owner@example.com",
        password="x",
        role="owner",
        is_active=True,
    )
    org = Organization.objects.create(
        name="Modern Cafe",
        slug="modern-cafe",
        default_locale="tr",
        supported_locales=["tr", "en"],
        currency="TRY",
        is_active=True,
    )
    Membership.objects.create(
        user=user, organization=org, role=MembershipRole.OWNER
    )
    menu = Menu.objects.create(
        organization=org,
        slug="modern-cafe-menu",
        name="Modern Cafe Menu",
        default_locale="tr",
        supported_locales=["tr", "en"],
        is_active=True,
    )
    for cat_idx in range(5):
        cat = MenuCategory.objects.create(
            menu=menu,
            slug=f"category-{cat_idx + 1}",
            name=f"Category {cat_idx + 1}",
            description="🍽️",
            sort_order=cat_idx,
            is_active=True,
        )
        for item_idx in range(5):
            MenuItem.objects.create(
                menu=menu,
                category=cat,
                name=f"Item {cat_idx + 1}.{item_idx + 1}",
                price=Decimal("50.00") + Decimal(item_idx * 5),
                description="",
                currency="TRY",
                sort_order=item_idx,
                is_active=True,
                is_available=True,
            )
    return org
