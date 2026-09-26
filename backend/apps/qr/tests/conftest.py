"""Shared fixtures for QR app tests.

Re-uses `api_client` / `org_a` / `org_b` / `admin_user` from the root
conftest, plus a `menu_a` fixture scoped to `org_a` so each test has a
real menu to attach QR codes to.
"""

from __future__ import annotations

import pytest

from apps.branches.models import Branch
from apps.menu.models import Menu

pytestmark = pytest.mark.django_db


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


@pytest.fixture
def branch_a(org_a):
    return Branch.objects.create(
        organization=org_a,
        name="Kadıköy",
        slug="kadikoy",
        is_active=True,
    )
