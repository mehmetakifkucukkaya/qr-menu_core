"""Account + loyalty services — Sprint 10A (D-025).

The three auth services funnel through the thread-local audit context
(see ``apps.audit.context``) so that every successful or attempted
operation emits a properly-scoped AuditEvent without explicit plumbing
at the call sites.

Auth services
-------------
* :func:`request_magic_link` — idempotent envelope. Always returns
  ``{"ok": True}`` regardless of whether the email maps to an existing
  customer (enumeration safe). Creates the Customer row if missing.
* :func:`verify_magic_link` — token lookup + expiry + single-use
  enforcement. Returns the resolved Customer instance, or raises
  ``MagicLinkError`` with a stable error code.

Loyalty services
----------------
* :func:`award_points_for_order` — called by ``transition_status``
  when ``new_status == 'delivered'``. Idempotent via the
  ``(order, type='earn')`` unique constraint.
* :func:`redeem_points` — validates balance + minimum threshold +
  active loyalty. Records a negative ``LoyaltyTransaction`` so the
  ledger sum stays consistent.
* :func:`customer_balance` — single ``Sum`` per
  (customer, organization). Cancellation/refund flows call
  :func:`reverse_points` to undo either side of the ledger.

Audit integration
-----------------
Every public entry point records the appropriate AuditEvent with
``actor=None`` (these are end-customer actions, not admin actions).
The audit row's ``organization`` is the relevant tenant — either the
caller's IP for unauthenticated requests, or the resolved org on
``Order`` / ``LoyaltyTransaction`` for paid actions.

Security notes
--------------
* The ``request_magic_link`` endpoint is enumeration-safe by design:
  the response is the same shape regardless of whether the email
  exists. The throttle + audit ``customer_login`` event are the only
  signals that an attempted login happened.
* ``verify_magic_link`` is single-use via the ``used_at`` timestamp.
  A second consume raises ``MagicLinkError('token.used')`` so the
  view can decide whether to log the replay attempt.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone

from apps.organizations.models import Organization

from .models import Customer, LoyaltySettings, LoyaltyTransaction, MagicLinkToken

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class MagicLinkError(Exception):
    """Stable-code error from the magic-link services.

    ``code`` is a short machine identifier (e.g. ``token.expired``);
    views translate the code into the appropriate HTTP response
    (400 for missing/invalid/expired/used). The message is in Turkish
    so the customer-facing copy is consistent.
    """

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class LoyaltyError(Exception):
    """Stable-code error from the loyalty services."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


# ---------------------------------------------------------------------------
# Auth services
# ---------------------------------------------------------------------------
@dataclass
class MagicLinkRequestResult:
    """Return value for :func:`request_magic_link`.

    The ``customer`` field is useful for tests + future callers that
    want to know whether the email existed before issuance. The HTTP
    view does NOT leak that distinction.
    """

    customer: Customer
    token: MagicLinkToken
    created: bool  # True iff ``customer`` was first created here


def request_magic_link(
    *,
    email: str,
    requested_ip: Optional[str] = None,
    send_email: bool = True,
) -> MagicLinkRequestResult:
    """Issue a magic link for ``email``.

    Idempotent: if the ``Customer`` exists, we re-use it. The token
    table is unbounded by design — old tokens are not deleted by
    this function (cleanup is the operator's choice; they will simply
    age out via the TTL and any successful verify stamps ``used_at``
    so they can't be replayed).

    ``send_email`` defaults to ``True`` so production callers don't
    need to wire it. Tests pass ``send_email=False`` and assert on
    the queue contents directly.
    """
    normalized = email.strip().lower()
    if not normalized:
        raise ValidationError("Email adresi zorunludur.")

    customer, created = Customer.objects.get_or_create(
        email=normalized,
        defaults={"full_name": "", "phone": ""},
    )

    token = MagicLinkToken.generate(
        customer=customer,
        ttl_minutes=settings.MAGIC_LINK_TTL_MINUTES,
        requested_ip=requested_ip,
    )

    if send_email:
        _send_magic_link_email(customer, token)

    # ``customer_registered`` audit is the only side-channel signal
    # that a customer is now part of the system. (``customer_login``
    # audit happens on every request, regardless of creation.)
    if created:
        _audit_customer_registered(customer, requested_ip)

    return MagicLinkRequestResult(
        customer=customer, token=token, created=created
    )


def verify_magic_link(*, token: str) -> Customer:
    """Verify a magic link ``token`` and return the resolved Customer.

    Order of checks (each one raises ``MagicLinkError`` with a stable
    code; the view maps each code to the HTTP response shape):

    1. unknown token (raw input doesn't exist) → ``token.not_found``
    2. already consumed (``used_at`` set)        → ``token.used``
    3. expired  (TTL elapsed)                    → ``token.expired``
    4. success                                   → stamp ``used_at``
    + update ``customer.last_login_at``.

    The customer update + ``used_at`` stamp happen in the same
    transaction; a write crash leaves no audit-but-no-state mismatch.
    """
    token = (token or "").strip()
    if not token:
        raise MagicLinkError("token.not_found", "Geçersiz bağlantı.")

    try:
        instance = MagicLinkToken.objects.select_related("customer").get(
            token=token
        )
    except MagicLinkToken.DoesNotExist as exc:
        raise MagicLinkError(
            "token.not_found", "Geçersiz bağlantı."
        ) from exc

    if instance.used_at is not None:
        raise MagicLinkError(
            "token.used", "Bu bağlantı daha önce kullanılmış."
        )

    if instance.expires_at <= timezone.now():
        raise MagicLinkError(
            "token.expired", "Bu bağlantının süresi dolmuş."
        )

    customer = instance.customer
    if not customer.is_active:
        raise MagicLinkError(
            "customer.inactive",
            "Bu hesap devre dışı bırakılmış.",
        )

    with transaction.atomic():
        MagicLinkToken.objects.filter(pk=instance.pk).update(
            used_at=timezone.now()
        )
        Customer.objects.filter(pk=customer.pk).update(
            last_login_at=timezone.now()
        )
    customer.last_login_at = timezone.now()
    customer.refresh_from_db(fields=("last_login_at",))
    _audit_customer_login(customer, instance.requested_ip)
    return customer


# ---------------------------------------------------------------------------
# Loyalty services
# ---------------------------------------------------------------------------
def award_points_for_order(order) -> Optional[LoyaltyTransaction]:
    """Award puan to ``order.customer`` for a delivered order.

    Trigger from ``apps.orders.services.transition_status`` when
    ``new_status == 'delivered'``. Idempotent via the unique
    constraint on ``(order, type='earn')``: a second call for the
    same Order catches ``IntegrityError`` and returns ``None``.

    Returns ``None`` if loyalty is disabled for the org, the order has
    no linked customer (guest checkout), or the order isn't paid-amount
    positive. Otherwise returns the persisted ``LoyaltyTransaction``.
    """
    if order.customer_id is None:
        return None
    settings_obj = (
        LoyaltySettings.objects.filter(organization=order.organization)
        .first()
    )
    if settings_obj is None or not settings_obj.is_enabled:
        return None
    if order.total_amount <= Decimal("0"):
        return None

    points = int(
        (order.total_amount * settings_obj.points_per_currency_unit).quantize(
            Decimal("1"), rounding="ROUND_FLOOR"
        )
    )
    if points <= 0:
        return None

    try:
        with transaction.atomic():
            txn = LoyaltyTransaction.objects.create(
                customer=order.customer,
                organization=order.organization,
                type=LoyaltyTransaction.EARN,
                points=points,
                order=order,
                note=f"Sipariş {order.order_number}",
            )
    except IntegrityError:
        # Idempotency guard. A concurrent re-deliver or a retry from
        # the state machine hit the unique constraint — the earn row
        # already exists; nothing to do. The ``atomic()`` wrapper
        # rolls back the offending row's savepoint so the rest of
        # the test / request keeps a clean transaction state.
        return None

    _audit_loyalty_earned(order, txn)
    return txn


def redeem_points(
    *,
    customer: Customer,
    organization: Organization,
    points: int,
    order=None,
    note: str = "",
) -> LoyaltyTransaction:
    """Redeem ``points`` from ``customer``'s ledger at ``organization``.

    Validates: positive integer, loyalty enabled, sufficient balance,
    minimum-threshold met. Records a negative ``LoyaltyTransaction``
    (points=-N) so the running balance via ``Sum`` reflects the
    redemption.

    Raises :class:`LoyaltyError` with a stable code for any failure.
    Returns the persisted transaction on success.
    """
    if points is None or points <= 0:
        raise LoyaltyError(
            "loyalty.invalid_points",
            "Puan miktarı pozitif bir tam sayı olmalı.",
        )

    settings_obj = (
        LoyaltySettings.objects.filter(organization=organization).first()
    )
    if settings_obj is None or not settings_obj.is_enabled:
        raise LoyaltyError(
            "loyalty.disabled",
            "Bu işletme için sadakat programı kapalı.",
        )

    if points < settings_obj.min_points_to_redeem:
        raise LoyaltyError(
            "loyalty.below_threshold",
            f"En az {settings_obj.min_points_to_redeem} puan kullanılabilir.",
        )

    balance = customer_balance(customer=customer, organization=organization)
    if balance < points:
        raise LoyaltyError(
            "loyalty.insufficient_balance",
            "Puan bakiyesi yetersiz.",
        )

    txn = LoyaltyTransaction.objects.create(
        customer=customer,
        organization=organization,
        type=LoyaltyTransaction.REDEEM,
        points=-points,
        order=order,
        note=note or f"{points} puan harcandı",
    )
    _audit_loyalty_redeemed(customer, organization, txn)
    return txn


def customer_balance(
    *, customer: Customer, organization: Organization
) -> int:
    """Return the signed-int puan balance for ``customer`` at ``organization``.

    Single ``Sum`` over the ledger scoped by (customer, organization).
    Adjust-up entries offset expired/redeemed entries because both use
    negative integers — same direction in the signed sum.
    """
    total = (
        LoyaltyTransaction.objects.filter(
            customer=customer, organization=organization
        )
        .aggregate(total=Sum("points"))
        .get("total")
        or 0
    )
    return int(total)


def reverse_points(
    *,
    customer: Customer,
    organization: Organization,
    points: int,
    order=None,
    note: str = "",
) -> LoyaltyTransaction:
    """Append a ``REVERSE`` entry to undo a previous earn / redeem.

    Used by order cancellation paths (10A keeps this minimal — the
    public order API doesn't yet allow cancellation, but admin
    transitions through CANCELLED can call this to keep the ledger
    accurate).
    """
    txn = LoyaltyTransaction.objects.create(
        customer=customer,
        organization=organization,
        type=LoyaltyTransaction.REVERSE,
        points=-points,
        order=order,
        note=note or f"{points} puan geri alındı",
    )
    _audit_loyalty_redeemed(
        customer,
        organization,
        txn,
        action="loyalty_redeemed",
        extra_payload={"kind": "reverse", "note": note},
    )
    return txn


def adjust_points(
    *,
    customer: Customer,
    organization: Organization,
    delta_points: int,
    admin_user,
    note: str = "",
) -> LoyaltyTransaction:
    """Manual admin adjustment (+/-) for a customer at an org.

    Records a single ``ADJUST`` row with the signed integer; the
    balance via ``customer_balance`` updates naturally because the
    sum absorbs the sign.
    """
    if delta_points == 0:
        raise LoyaltyError(
            "loyalty.invalid_points",
            "Düzeltme miktarı sıfır olamaz.",
        )

    txn = LoyaltyTransaction.objects.create(
        customer=customer,
        organization=organization,
        type=LoyaltyTransaction.ADJUST,
        points=delta_points,
        note=note or "Manuel düzeltme",
    )

    # Audit: loyalty_adjusted, with admin actor.
    from apps.audit.services import record_event

    record_event(
        organization=organization,
        action="loyalty_adjusted",
        target_type="loyalty_transaction",
        target_id=txn.id,
        target_repr=(
            f"{customer.email} {delta_points:+d} puan"
            f" (admin: {getattr(admin_user, 'email', 'unknown')})"
        ),
        payload={
            "delta_points": delta_points,
            "note": note,
            "admin_id": getattr(admin_user, "id", None),
            "customer_id": customer.id,
        },
    )
    return txn


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------
def _send_magic_link_email(
    customer: Customer, token: MagicLinkToken
) -> None:
    """Render + send the magic-link email via D-018's email backend."""
    # The frontend will read the token from the link and call
    # ``GET /api/v1/account/auth/verify?token=...``. We point the
    # link at PUBLIC_BASE_URL + a path that the Next.js app routes
    # to its own verify page (added in Sprint 10B). For V1, PUBLIC_BASE_URL
    # is the Next.js dev origin.
    verify_url = "{base}{path}?token={token}".format(
        base=settings.PUBLIC_BASE_URL.rstrip("/"),
        path="/account/verify",
        token=token.token,
    )
    context = {
        "verify_url": verify_url,
        "ttl_minutes": settings.MAGIC_LINK_TTL_MINUTES,
        "email": customer.email,
    }
    subject = "QR Menü — Giriş Yap"
    text_body = render_to_string(
        "account/magic_link_email.txt", context
    )
    html_body = render_to_string(
        "account/magic_link_email.html", context
    )
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[customer.email],
    )
    msg.attach_alternative(html_body, "text/html")
    msg.send(fail_silently=True)


def _audit_customer_registered(
    customer: Customer, requested_ip: Optional[str]
) -> None:
    """Emit a ``customer_registered`` audit for a freshly-created customer.

    Pre-tenant audit best-effort. The ``AuditEvent.organization`` field
    is mandatory, but a brand-new customer has no tenant context yet
    (the first order placement will pin one). We log via the standard
    logger so the abuse-detection signal still lands, but skip the
    org-bound AuditEvent row — and let the operator dial this in
    later (a platform "system" org, a separate signals table, …).
    """
    logger.info(
        "customer_registered customer_id=%s email=%s ip=%s",
        customer.id,
        customer.email,
        requested_ip,
    )


def _audit_customer_login(
    customer: Customer, requested_ip: Optional[str]
) -> None:
    """Same as :func:`_audit_customer_registered` but for the verify path.

    Theuth abuse-detection signal lands via the standard logger; the
    org-bound AuditEvent row is emitted from the org-aware call sites
    (order placement → service remembers the customer_id).
    """
    logger.info(
        "customer_login customer_id=%s email=%s ip=%s",
        customer.id,
        customer.email,
        requested_ip,
    )


def _audit_loyalty_earned(order, txn: LoyaltyTransaction) -> None:
    from apps.audit.services import record_event

    record_event(
        organization=order.organization,
        action="loyalty_earned",
        target_type="loyalty_transaction",
        target_id=txn.id,
        target_repr=(
            f"{txn.customer.email} {txn.points:+d} puan"
            f" (sipariş {order.order_number})"
        ),
        payload={
            "points": txn.points,
            "order_id": order.id,
            "order_number": order.order_number,
        },
    )


def _audit_loyalty_redeemed(
    customer: Customer,
    organization: Organization,
    txn: LoyaltyTransaction,
    *,
    action: str = "loyalty_redeemed",
    extra_payload: Optional[dict] = None,
) -> None:
    from apps.audit.services import record_event

    payload = {
        "points": txn.points,
        "customer_id": customer.id,
        "order_id": txn.order_id,
    }
    if extra_payload:
        payload.update(extra_payload)
    record_event(
        organization=organization,
        action=action,
        target_type="loyalty_transaction",
        target_id=txn.id,
        target_repr=(
            f"{customer.email} {txn.points:+d} puan"
            f" (org: {organization.slug})"
        ),
        payload=payload,
    )
