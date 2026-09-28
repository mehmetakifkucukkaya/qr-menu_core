"""Account models — Sprint 10A (D-025).

Three groups of models backing the customer-facing auth + loyalty surface:

* :class:`Customer` — end-customer identity. Email-unique, no password.
  Distinct from ``apps.accounts.models.User`` (platform admin user);
  customers never log into the admin.

* :class:`MagicLinkToken` — single-use, time-bound token issued by
  ``services.request_magic_link``. Stored with the request IP for
  abuse analysis and an ``used_at`` flag for single-use enforcement.

* :class:`LoyaltySettings` + :class:`LoyaltyTransaction` — per-org
  loyalty configuration + ledger. ``LoyaltySettings`` is ``OneToOne``
  on ``Organization`` (each tenant has at most one config row).
  ``LoyaltyTransaction`` is a signed-integer ledger so we can sum
  in-place for any balance window without snapshot tables.

Pattern notes
-------------
* Customer → orders → menu.organization: the chain that resolves
  tenant scope for customer-owned data. There's no direct
  ``Customer.organization`` FK — customers are organisation-agnostic;
  tenant isolation is enforced at the ``LoyaltyTransaction`` /
  ``Order`` level via the foreign keys that already carry
  ``organization``.

* ``LoyaltyTransaction`` unique constraint on ``(order, type='earn')``
  is the idempotency guard for the "delivered → award puan" path.
  Retries of ``award_points_for_order`` for the same Order hit the
  constraint and the service treats that as a no-op.

* The ``points`` field is signed (+ earn, − redeem/expire/reverse)
  so ``customer_balance`` is a single ``Sum`` per tenant.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Customer + magic-link token
# ---------------------------------------------------------------------------
class Customer(models.Model):
    """An end-customer account.

    Email is the canonical identity — unique, lowercased on save via
    ``EmailField`` + service-level normalization. ``password`` is
    intentionally absent: customers sign in via the magic-link flow
    only (D-025).

    The model is intentionally organization-agnostic. Tenant isolation
    comes from the relationships (``Order.customer``,
    ``LoyaltyTransaction.customer``) that link a customer to a single
    org at the order/transaction level.
    """

    email = models.EmailField(
        unique=True,
        help_text="Lowercased on save; canonical sign-in identity.",
    )
    full_name = models.CharField(max_length=120, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")

    is_active = models.BooleanField(
        default=True,
        help_text="Inactive customers cannot authenticate or earn points.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Müşteri"
        verbose_name_plural = "Müşteriler"
        indexes = [
            models.Index(fields=("email",)),
            models.Index(fields=("-last_login_at",)),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return self.email


class MagicLinkToken(models.Model):
    """A one-time magic-link token for ``Customer`` authentication.

    Tokens are ``UUID4().hex`` (32 chars, no dashes) stored as a
    64-char CharField — the extra 32 chars of headroom let us later
    swap to base64 secret-bytes without a schema migration.

    Lifecycle:

    1. ``request_magic_link`` creates a row with ``used_at=None``
       and ``expires_at = now + TTL``.
    2. Customer clicks the email link → ``verify_magic_link``.
    3. Service marks ``used_at = now()`` AND compares expiry — both
       must pass for the verification to succeed.

    The unique index on ``token`` is the single-use enforcement at
    the DB level. The Python ``is_valid`` property is a fast path for
    callers that want to inspect a token without writing to it.
    """

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="magic_tokens",
    )
    token = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        help_text="UUID4 hex. Stored once, invalidated on first use.",
    )
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    requested_ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Magic Link Token"
        verbose_name_plural = "Magic Link Tokens"
        indexes = [
            models.Index(fields=("token", "expires_at")),
            models.Index(fields=("customer", "-created_at")),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.customer_id}::exp={self.expires_at:%Y-%m-%d %H:%M}"

    @property
    def is_valid(self) -> bool:
        """True iff not yet consumed and not yet expired."""
        return self.used_at is None and self.expires_at > timezone.now()

    @classmethod
    def generate(
        cls,
        customer: Customer,
        ttl_minutes: int,
        requested_ip: str | None = None,
    ) -> "MagicLinkToken":
        """Build + persist a fresh token for ``customer``.

        Centralized here so callers don't reach for ``uuid`` or
        timezone math directly — keeps the format consistent across
        the request-link service and any future passwordless flow.
        """
        expires_at = timezone.now() + timezone.timedelta(minutes=ttl_minutes)
        return cls.objects.create(
            customer=customer,
            token=uuid.uuid4().hex,
            expires_at=expires_at,
            requested_ip=requested_ip,
        )


# ---------------------------------------------------------------------------
# Loyalty
# ---------------------------------------------------------------------------
class LoyaltySettings(models.Model):
    """Per-organization loyalty configuration (OneToOne on Organization).

    Tenant isolation: each org has at most one ``LoyaltySettings`` row.
    Created on-demand (lazy) when an admin enables loyalty for the
    first time — defaults are conservative (off + threshold defaults
    from ``settings.LOYALTY_DEFAULT_ENABLED``).
    """

    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="loyalty_settings",
    )

    is_enabled = models.BooleanField(
        default=False,
        help_text="Master switch. Off = no earn / redeem / balance.",
    )
    # 1 TL = N puan (default 1.00 = 1 puan per TL).
    points_per_currency_unit = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=Decimal("1.00"),
        help_text="Earn rate: order.total_amount * this = points awarded.",
    )
    # 1 puan = N TL indirim (default 0.10 = 100 puan = 10 TL).
    redemption_rate = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=Decimal("0.10"),
        help_text="Redeem rate: points_to_redeem * this = discount (TL).",
    )
    min_points_to_redeem = models.PositiveIntegerField(
        default=100,
        help_text="Minimum puan bakiyesi gerekli (e.g. 100).",
    )
    points_expiry_days = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Days before earned points expire. null = never expire.",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Sadakat Ayarları"
        verbose_name_plural = "Sadakat Ayarları"

    def __str__(self) -> str:  # pragma: no cover
        return f"LoyaltySettings({self.organization.slug}, on={self.is_enabled})"


class LoyaltyTransaction(models.Model):
    """Signed-integer ledger for loyalty puan.

    The ``points`` column is signed: ``+`` for earn / adjust-up /
    reverse-of-redeem, ``-`` for redeem / expire / adjust-down /
    reverse-of-earn. ``customer_balance`` is therefore ``Sum(points)``
    per (customer, organization) — one indexed scan, no complex
    aggregation.

    Idempotency for the earn path is enforced at the DB level via the
    conditional unique constraint on ``(order, type='earn')``. A retry
    of ``award_points_for_order`` for the same Order hits that
    constraint and the service treats it as a no-op.
    """

    EARN = "earn"
    REDEEM = "redeem"
    EXPIRE = "expire"
    ADJUST = "adjust"
    REVERSE = "reverse"

    TYPE_CHOICES = [
        (EARN, "Earn"),
        (REDEEM, "Redeem"),
        (EXPIRE, "Expire"),
        (ADJUST, "Adjust"),
        (REVERSE, "Reverse"),
    ]

    customer = models.ForeignKey(
        Customer,
        on_delete=models.CASCADE,
        related_name="loyalty_transactions",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="loyalty_transactions",
    )

    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    points = models.IntegerField(
        help_text="Signed integer. Earn/reverse-of-redemption = +, "
        "redeem/expire/adjust-down = -.",
    )

    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loyalty_transactions",
    )
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Sadakat İşlemi"
        verbose_name_plural = "Sadakat İşlemleri"
        indexes = [
            models.Index(fields=("customer", "-created_at")),
            models.Index(fields=("organization", "type")),
            models.Index(fields=("organization", "customer", "-created_at")),
        ]
        constraints = [
            # Idempotency: one earn row per Order (the canonical
            # "delivered → award" path runs at most once per order).
            # Manual rewards can use type=ADJUST instead.
            models.UniqueConstraint(
                fields=("order", "type"),
                condition=models.Q(type="earn"),
                name="unique_earn_per_order",
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.customer_id} {self.type} {self.points:+d}"
