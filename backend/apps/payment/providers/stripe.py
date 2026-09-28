"""Stripe SDK adapter — primary provider for V1.

The Stripe SDK does not need a long-lived client object; it lazy-loads
``stripe.api_key`` from the module. We set it once during ``__init__``
and clear it on garbage collection via ``api_key`` being a module attr
overwritten on each instantiation (SDK is itself a singleton pattern,
not thread-local; the request-scoped override is safe for Django's
``WSGIServer`` single-thread dev loop and for gunicorn workers — each
gunicorn worker sets its own ``stripe.api_key`` from ``__init__``).

Webhook signature verification uses
``stripe.Webhook.construct_event`` which enforces constant-time
comparison internally.
"""

from __future__ import annotations

from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from typing import Optional

import stripe
from stripe.error import InvalidRequestError, SignatureVerificationError

from .base import (
    InvalidSignatureError,
    PaymentIntent,
    PaymentProvider,
    PaymentStatus,
    RefundReceipt,
    WebhookEvent,
)


class StripeProvider(PaymentProvider):
    """Concrete Stripe implementation.

    ``api_key`` MUST be the decrypted plaintext (i.e. already through
    ``PaymentSettings.api_key``); ``webhook_secret`` likewise. The
    settings model decrypts via the ``api_key`` / ``webhook_secret``
    properties, so this class never sees ciphertext.
    """

    name = "stripe"

    def __init__(self, *, api_key: str, webhook_secret: str, is_test_mode: bool = True):
        # Configure the SDK once per provider instance — Stripe reads this
        # module global on every API call.
        stripe.api_key = api_key
        self.webhook_secret = webhook_secret
        self.is_test_mode = is_test_mode

    # -- create ------------------------------------------------------

    def create_payment_intent(
        self,
        *,
        amount: Decimal,
        currency: str,
        metadata: dict,
    ) -> PaymentIntent:
        # Stripe uses minor units (cents for USD/TRY/EUR).
        amount_minor = int(amount * 100)
        try:
            intent = stripe.PaymentIntent.create(
                amount=amount_minor,
                currency=currency.lower(),
                metadata=metadata,
                automatic_payment_methods={"enabled": True},
            )
        except stripe.error.APIConnectionError as exc:
            # Surface a 502 to the caller rather than raising the SDK
            # exception type.
            from ..errors import PaymentProviderUnavailable

            raise PaymentProviderUnavailable(f"Stripe connection failed: {exc}") from exc

        return PaymentIntent(
            provider_payment_id=intent.id,
            client_secret=intent.client_secret,
            amount=Decimal(intent.amount) / 100,
            currency=intent.currency.upper(),
            status=intent.status,
            metadata=dict(intent.metadata or {}),
        )

    # -- retrieve ----------------------------------------------------

    def retrieve_payment(self, provider_payment_id: str) -> PaymentStatus:
        intent = stripe.PaymentIntent.retrieve(provider_payment_id)
        amount_received = (
            Decimal(intent.amount_received) / 100
            if getattr(intent, "amount_received", None)
            else None
        )

        # Stripe encodes ``created`` as a unix timestamp on the latest_charge
        # when status transitions to ``succeeded``.
        paid_at_iso = None
        latest_charge = getattr(intent, "latest_charge", None)
        if intent.status == "succeeded" and latest_charge:
            try:
                charge = stripe.Charge.retrieve(latest_charge)
                paid_at_iso = datetime.fromtimestamp(
                    charge.created, tz=dt_timezone.utc
                ).isoformat()
            except InvalidRequestError:
                paid_at_iso = None

        return PaymentStatus(
            provider_payment_id=intent.id,
            status=intent.status,
            amount_received=amount_received,
            paid_at_iso=paid_at_iso,
        )

    # -- refund ------------------------------------------------------

    def refund(
        self,
        *,
        provider_payment_id: str,
        amount: Optional[Decimal] = None,
        reason: str = "admin_action",
    ) -> RefundReceipt:
        params: dict = {"payment_intent": provider_payment_id}
        if amount is not None:
            params["amount"] = int(amount * 100)
        # Stripe's enum: 'duplicate' | 'fraudulent' | 'requested_by_customer'.
        # ``requested_by_customer`` is the closest match for ``customer_request``.
        if reason in ("customer_request", "requested_by_customer"):
            params["reason"] = "requested_by_customer"
        elif reason in ("duplicate", "fraudulent"):
            params["reason"] = reason

        refund = stripe.Refund.create(**params)
        return RefundReceipt(
            provider_refund_id=refund.id,
            amount=Decimal(refund.amount) / 100,
            status=refund.status,
            reason=reason,
            created_at_iso=(
                datetime.fromtimestamp(refund.created, tz=dt_timezone.utc).isoformat()
                if refund.created
                else ""
            ),
        )

    # -- webhook verify ----------------------------------------------

    def verify_webhook(self, *, payload: bytes, signature_header: str) -> WebhookEvent:
        if not self.webhook_secret:
            # Defence-in-depth: in production the webhook secret must be set
            # before the operator enables the integration. Refuse to accept.
            raise InvalidSignatureError(
                "Webhook secret not configured for this tenant."
            )
        try:
            event = stripe.Webhook.construct_event(
                payload, signature_header, self.webhook_secret
            )
        except SignatureVerificationError as exc:
            raise InvalidSignatureError(str(exc)) from exc
        except ValueError as exc:
            # Malformed JSON payload — Stripe raises ``ValueError``.
            raise InvalidSignatureError(f"Invalid webhook payload: {exc}") from exc

        # Normalise to the structured ``WebhookEvent`` dataclass.
        data = event.to_dict() if hasattr(event, "to_dict") else dict(event)
        return WebhookEvent(
            provider="stripe",
            event_type=data.get("type", ""),
            provider_event_id=data.get("id", ""),
            payload=data,
        )
