"""Payment provider abstraction — D-026 (Sprint 11A).

Mirrors the D-021 ``apps/pdf_import/services.py`` provider pattern: a
small abstract base class with ``create_payment_intent``,
``retrieve_payment``, ``refund``, and ``verify_webhook`` operations.
Each concrete provider (``StripeProvider``, future ``IyzicoProvider``)
adapts to its native SDK in the implementations module.

Why a separate module for ``dataclasses``? ``apps/payment/services.py``
imports the dataclasses but not the providers themselves, which keeps
the service layer's test surface small — unit-test services by handing
them a fake subclass of ``PaymentProvider``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional


class InvalidSignatureError(Exception):
    """Raised by ``PaymentProvider.verify_webhook`` when the incoming
    signature does not match the configured webhook secret."""


@dataclass(frozen=True)
class PaymentIntent:
    provider_payment_id: str          # e.g. Stripe ``pi_3Oxxxxxxxxxxxxxx``
    client_secret: str               # Stripe Elements — published to the FE
    amount: Decimal
    currency: str
    status: str = "requires_payment_method"
    metadata: dict = field(default_factory=dict)


@dataclass(frozen=True)
class PaymentStatus:
    provider_payment_id: str
    status: str
    amount_received: Optional[Decimal] = None
    paid_at_iso: Optional[str] = None


@dataclass(frozen=True)
class RefundReceipt:
    provider_refund_id: str          # e.g. Stripe ``re_3Oxxxxxxxxxxxxxx``
    amount: Decimal
    status: str
    reason: str = "admin_action"
    created_at_iso: str = ""


@dataclass(frozen=True)
class WebhookEvent:
    """Result of a verified webhook: a structured event object the
    service layer can dispatch on without touching the underlying
    provider's SDK types."""

    provider: str                    # 'stripe'
    event_type: str                  # Stripe ``event.type``, e.g.
                                     # ``payment_intent.succeeded``
    provider_event_id: str           # Stripe ``evt_xxx`` (idempotency key)
    payload: dict


class PaymentProvider(ABC):
    """Abstract base — return concrete ``PaymentIntent`` / ``PaymentStatus``
    / ``RefundReceipt`` / ``WebhookEvent`` data structures. Implementations
    must be cheap to instantiate (the registry creates one per request,
    holding only API key + webhook secret in memory)."""

    #: Short provider name — must be one of ``PaymentSettings.PROVIDER_CHOICES``.
    name: str = "base"

    @abstractmethod
    def create_payment_intent(
        self,
        *,
        amount: Decimal,
        currency: str,
        metadata: dict,
    ) -> PaymentIntent: ...

    @abstractmethod
    def retrieve_payment(self, provider_payment_id: str) -> PaymentStatus: ...

    @abstractmethod
    def refund(
        self,
        *,
        provider_payment_id: str,
        amount: Optional[Decimal] = None,
        reason: str = "admin_action",
    ) -> RefundReceipt: ...

    @abstractmethod
    def verify_webhook(
        self,
        *,
        payload: bytes,
        signature_header: str,
    ) -> WebhookEvent:
        """Verify the webhook signature and return a structured event.

        Raises ``InvalidSignatureError`` on signature mismatch — the view
        turns this into a 401 ``payment.invalid_signature`` response.
        """
