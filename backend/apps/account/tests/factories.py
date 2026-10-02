"""Account factories — Sprint 10A (D-025).

Lightweight factories for the unique models in this app. We keep
them in tests/factories.py so the ``apps/translate/tests/factories.py``
pattern doesn't have to be hand-copied each time.

All factories take only kwargs that matter; defaults mirror the
"customer just clicked the magic link" reality:

* :func:`make_customer` — minimal Customer row.
* :func:`make_magic_token` — fresh, unconsumed, unexpired.
* :func:`make_loyalty_settings` — org-level config. ``is_enabled=False``
  by default; tests that need award to fire have to opt in.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Optional

from django.conf import settings
from django.core import signing
from django.http import HttpResponse
from django.utils import timezone

from apps.account.models import (
    Customer,
    LoyaltySettings,
    LoyaltyTransaction,
    MagicLinkToken,
)
from apps.organizations.models import Organization


def make_customer(
    email: str = "customer@example.com",
    *,
    full_name: str = "",
    phone: str = "",
    is_active: bool = True,
) -> Customer:
    return Customer.objects.create(
        email=email.lower(),
        full_name=full_name,
        phone=phone,
        is_active=is_active,
    )


def make_magic_token(
    customer: Customer,
    *,
    expired: bool = False,
    used: bool = False,
    ip: Optional[str] = None,
    ttl_minutes: int = 15,
    token: Optional[str] = None,
) -> MagicLinkToken:
    """Create a token with the requested lifecycle state."""
    expires_at = (
        timezone.now() - timedelta(minutes=1)
        if expired
        else timezone.now() + timedelta(minutes=ttl_minutes)
    )
    return MagicLinkToken.objects.create(
        customer=customer,
        token=token or MagicLinkToken.generate.__func__.__name__ + "-test",
        expires_at=expires_at,
        used_at=timezone.now() if used else None,
        requested_ip=ip,
    )


def make_loyalty_settings(
    organization: Organization,
    *,
    is_enabled: bool = True,
    points_per_currency_unit: Decimal = Decimal("1.0000"),
    redemption_rate: Decimal = Decimal("0.1000"),
    min_points_to_redeem: int = 100,
    points_expiry_days: Optional[int] = None,
) -> LoyaltySettings:
    return LoyaltySettings.objects.create(
        organization=organization,
        is_enabled=is_enabled,
        points_per_currency_unit=points_per_currency_unit,
        redemption_rate=redemption_rate,
        min_points_to_redeem=min_points_to_redeem,
        points_expiry_days=points_expiry_days,
    )


def make_earn_txn(
    customer: Customer,
    organization: Organization,
    *,
    points: int = 50,
    order=None,
    note: str = "Test earn",
) -> LoyaltyTransaction:
    return LoyaltyTransaction.objects.create(
        customer=customer,
        organization=organization,
        type=LoyaltyTransaction.EARN,
        points=points,
        order=order,
        note=note,
    )


def make_redeem_txn(
    customer: Customer,
    organization: Organization,
    *,
    points: int = 50,
    order=None,
    note: str = "Test redeem",
) -> LoyaltyTransaction:
    return LoyaltyTransaction.objects.create(
        customer=customer,
        organization=organization,
        type=LoyaltyTransaction.REDEEM,
        points=-points,
        order=order,
        note=note,
    )


# ---------------------------------------------------------------------------
# Customer session cookie helpers (F-07: the cookie is signed, not the bare pk)
# ---------------------------------------------------------------------------
def customer_cookie_value(customer: Customer) -> str:
    """Valid signed ``_auth_customer_id`` value, produced by production code.

    Use this to put a customer "in a session" without going through the
    magic-link round trip. Never put ``str(customer.pk)`` in the cookie: the
    server rejects it.
    """
    from apps.account.views import _set_customer_cookie

    response = HttpResponse()
    _set_customer_cookie(response, customer)
    return response.cookies[settings.AUTH_COOKIE_NAME].value


def customer_id_from_cookie(raw: str) -> Optional[int]:
    """Customer pk inside a signed cookie value, or ``None`` if it is invalid."""
    from apps.account.views import CUSTOMER_COOKIE_SALT, customer_cookie_max_age

    signer = signing.get_cookie_signer(
        salt=settings.AUTH_COOKIE_NAME + CUSTOMER_COOKIE_SALT
    )
    try:
        return int(signer.unsign(raw, max_age=customer_cookie_max_age()))
    except (signing.BadSignature, ValueError):
        return None
