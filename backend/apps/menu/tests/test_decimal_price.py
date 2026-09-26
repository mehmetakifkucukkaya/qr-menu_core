"""Decimal price tests (OP-6)."""

from __future__ import annotations

from decimal import Decimal

import pytest

pytestmark = pytest.mark.django_db


def test_price_stored_as_decimal_not_float(item):
    """`item.price` should be a `Decimal`, not `float`."""
    item.refresh_from_db()
    assert isinstance(item.price, Decimal)
    # Confirm the underlying type via the field's column
    field = item._meta.get_field("price")
    from django.db import models
    assert isinstance(field, models.DecimalField)
    assert field.decimal_places == 2
    assert field.max_digits == 10


def test_max_digits_enforced(menu, category):
    """DecimalField(max_digits=10, decimal_places=2) accepts up to 99999999.99."""
    from apps.menu.models import MenuItem
    from django.core.exceptions import ValidationError

    item = MenuItem(
        menu=menu, category=category, name="Edge",
        price=Decimal("99999999.99"),
    )
    item.full_clean()  # no error for valid edge

    too_big = MenuItem(
        menu=menu, category=category, name="TooBig",
        price=Decimal("100000000.00"),  # 9 digits before decimal, max_digits=10
    )
    with pytest.raises(ValidationError):
        too_big.full_clean()


def test_decimal_places_enforced(menu, category):
    """More than 2 decimal places is rejected by full_clean."""
    from apps.menu.models import MenuItem
    from django.core.exceptions import ValidationError

    item = MenuItem(
        menu=menu, category=category, name="ThreeDecimals",
        price=Decimal("12.999"),
    )
    with pytest.raises(ValidationError):
        item.full_clean()


def test_currency_default_try(menu, category):
    """Default currency is TRY."""
    from apps.menu.models import MenuItem

    item = MenuItem.objects.create(
        menu=menu, category=category, name="Default Cur", price=Decimal("10.00")
    )
    assert item.currency == "TRY"