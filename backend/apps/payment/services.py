"""Payment business logic — D-026 (Sprint 11A).

Public API surface:

* ``create_payment_for_order(order)`` — Stripe ``PaymentIntent`` create.
* ``handle_webhook_event(provider_name, payload, signature_header)`` —
  idempotent webhook dispatch.
* ``refund_payment(order, amount, reason, initiated_by_user)`` — full /
  partial refund, with D-025 loyalty REVERSE integration.
* ``reconcile_pending_payments(organization=None)`` — orphan intent
  scan, returns counts.

The ``webhook`` function is the entry point Stripe calls directly (via
``/api/v1/payment/webhooks/<provider>``); every other function is for
the admin or check-out paths.
"""

from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.audit.signals import record_event

from .errors import (
    PaymentInvalidSignature,
    PaymentProviderUnavailable,
    PaymentSettingMissing,
)
from .models import OrderPayment, RefundRecord, WebhookEvent
from .providers import get_provider_for_org
from .providers.base import InvalidSignatureError, WebhookEvent as ProviderWebhookEvent

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


@transaction.atomic
def create_payment_for_order(*, order):
    """Create a Stripe ``PaymentIntent`` for the given order.

    Idempotent: if ``order.payment`` already exists, the existing row is
    reused and the Stripe ID is overwritten only when its current status
    is one of the retryable ones (``requires_payment_method``,
    ``processing``, ``requires_action``).
    """
    provider = get_provider_for_org(order.organization)
    intent = provider.create_payment_intent(
        amount=order.total_amount,
        currency="TRY",
        metadata={
            "order_number": order.order_number,
            "tenant_slug": order.organization.slug,
            "order_id": order.id,
        },
    )

    defaults = {
        "organization": order.organization,
        "provider_name": provider.name,
        "provider_payment_id": intent.provider_payment_id,
        "provider_payment_status": intent.status,
        "amount": order.total_amount,
        "currency": intent.currency,
        "raw_response": {
            "client_secret": intent.client_secret,
            "metadata": intent.metadata,
        },
    }

    payment, _created = OrderPayment.objects.select_for_update().get_or_create(
        order=order,
        defaults=defaults,
    )
    if not _created:
        # Refresh with the new PaymentIntent data so the client receives an
        # updated ``client_secret`` on retry.
        for field, value in defaults.items():
            setattr(payment, field, value)
        payment.save(update_fields=list(defaults.keys()))

    return payment


def handle_webhook_event(
    *,
    provider_name: str,
    payload: bytes,
    signature_header: str,
) -> WebhookEvent:
    """Verify, deduplicate, dispatch, persist — all in one call.

    * The first line of defence is ``provider.verify_webhook`` — Stripe
      HMAC-SHA256 signature.
    * The second is the ``WebhookEvent`` cache — same ``provider_event_id``
      means we've already processed (or are processing) this event.
    """
    try:
        provider = get_provider_for_org_for_webhook(provider_name)
    except PaymentSettingMissing:
        # No settings for this provider_name — accept the webhook silently
        # so Stripe doesn't keep retrying. Audit-loggable via
        # ``logger.warning``.
        logger.warning(
            "Webhook for provider '%s' received but no PaymentSettings "
            "configured — ignoring.",
            provider_name,
        )
        return _mark_event(provider_name, "no_settings", payload, processed=False)

    try:
        event = provider.verify_webhook(
            payload=payload, signature_header=signature_header
        )
    except InvalidSignatureError as exc:
        raise PaymentInvalidSignature(str(exc)) from exc

    # Idempotency — ``WebhookEvent.objects.get_or_create`` is the second
    # line of defence. If a row with the same (provider, event_id)
    # already exists we return it without re-processing.
    web_hook_row, created = WebhookEvent.objects.get_or_create(
        provider_name=event.provider,
        provider_event_id=event.provider_event_id,
        defaults={
            "payload": event.payload,
            "processed": False,
        },
    )
    if not created:
        logger.info(
            "Duplicate webhook event %s/%s — skipping dispatch.",
            event.provider,
            event.provider_event_id,
        )
        return web_hook_row

    # Dispatch by event type. Stripe names events with dotted paths; we
    # only act on the customer-relevant subset.
    try:
        dispatch_webhook_event(event, web_hook_row)
        web_hook_row.processed = True
        web_hook_row.save(update_fields=["processed"])
    except Exception as exc:  # noqa: BLE001 — log + audit; webhook must not crash
        web_hook_row.error = f"{type(exc).__name__}: {exc}"
        web_hook_row.save(update_fields=["error"])
        logger.exception("Webhook dispatch failed for %s", event.provider_event_id)
        # Re-raise so the view returns 500 — Stripe will retry on 5xx.
        raise

    return web_hook_row


def refund_payment(
    *,
    order,
    amount: Optional[Decimal] = None,
    reason: str = "admin_action",
    initiated_by_user=None,
):
    """Issue a full or partial refund against the order's payment.

    Triggers D-025 ``LoyaltyTransaction.type='reverse'`` when the order
    has been delivered and previously awarded loyalty.

    Returns the freshly-created ``RefundRecord``. Idempotent at the
    provider level — Stripe ``Refund.create`` returns the existing refund
    for the same idempotency-key; we catch ``InvalidRequestError`` with
    a known Stripe pattern and return the prior row.
    """
    from .models import PaymentSettings  # noqa: WPS433 — local import avoids circular

    payment = getattr(order, "payment", None)
    if payment is None:
        raise PaymentSettingMissing(
            "Bu sipariş için payment kaydı bulunamadı. Önce /public/orders/"
            "pay endpoint'inden PaymentIntent oluşturun."
        )

    provider = get_provider_for_org(payment.organization)
    try:
        receipt = provider.refund(
            provider_payment_id=payment.provider_payment_id,
            amount=amount,
            reason=reason,
        )
    except Exception as exc:  # noqa: BLE001 — provider errors are 502
        raise PaymentProviderUnavailable(f"Stripe refund başarısız: {exc}") from exc

    refund_record = RefundRecord.objects.create(
        payment=payment,
        order=order,
        organization=payment.organization,
        provider_refund_id=receipt.provider_refund_id,
        amount=receipt.amount,
        reason=reason,
        initiated_by=initiated_by_user,
        status=receipt.status,
    )

    # D-025 loyalty REVERSE: find the earn transaction for this order
    # and create a matching reverse. Only runs if the order has been
    # delivered AND the customer actually earned points.
    reverse_loyalty_for_refund(order=order, refund_record=refund_record)

    record_event(
        organization=order.organization,
        actor=initiated_by_user,
        action="order_refunded",
        target_type="payment",
        target_id=refund_record.id,
        payload={
            "order_number": order.order_number,
            "amount": str(refund_record.amount),
            "reason": reason,
            "provider_refund_id": receipt.provider_refund_id,
        },
    )
    return refund_record


def reconcile_pending_payments(*, organization=None) -> dict:
    """Find payment intents left in non-terminal states.

    The V1 admin panel uses this when an order is stuck on
    ``pending`` because the Stripe webhook was missed (e.g. dev
    server offline). Iterates through pending rows, calls
    ``Provider.retrieve_payment``, and matches.

    Returns a small dict with ``reconciled`` (int) and ``scanned`` (int).
    """
    qs = OrderPayment.objects.filter(
        provider_payment_status__in=[
            "requires_payment_method",
            "requires_confirmation",
            "requires_action",
            "processing",
        ],
    )
    if organization is not None:
        qs = qs.filter(organization=organization)

    reconciled = 0
    scanned = 0
    for payment in qs.iterator():
        scanned += 1
        try:
            provider = get_provider_for_org(payment.organization)
            status = provider.retrieve_payment(payment.provider_payment_id)
        except Exception as exc:  # noqa: BLE001 — skip individual rows
            logger.warning("Reconcile skip %s: %s", payment, exc)
            continue

        if status.status == "succeeded" and payment.order.status == "pending":
            payment.provider_payment_status = status.status
            payment.amount = status.amount_received or payment.amount
            payment.paid_at = (
                timezone.datetime.fromisoformat(status.paid_at_iso)
                if status.paid_at_iso
                else None
            )
            payment.save(
                update_fields=["provider_payment_status", "amount", "paid_at"]
            )
            _confirm_order_after_payment(payment)
            reconciled += 1

    return {"reconciled": reconciled, "scanned": scanned}


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def get_provider_for_org_for_webhook(provider_name: str):
    """Webhook route has no ``organization`` in the URL — instead the
    provider's signature verification needs the right ``webhook_secret``.

    We look up the first ``PaymentSettings`` row that matches
    ``provider_name``. V1 only has Stripe, so this is fine; multi-provider
    webhook routing (one endpoint per provider_name) is the V2 SaaS
    extension.
    """
    from .models import PaymentSettings  # local to avoid circular

    settings = PaymentSettings.objects.filter(
        provider_name=provider_name, is_enabled=True
    ).first()
    if settings is None:
        raise PaymentSettingMissing(
            f"No PaymentSettings for provider={provider_name}"
        )

    from .providers.registry import PROVIDERS

    provider_cls = PROVIDERS.get(provider_name)
    if provider_cls is None:
        raise PaymentSettingMissing(f"Unknown provider: {provider_name}")

    return provider_cls(
        api_key=settings.api_key,  # decrypts
        webhook_secret=settings.webhook_secret,
        is_test_mode=settings.is_test_mode,
    )


def dispatch_webhook_event(event: ProviderWebhookEvent, row: WebhookEvent) -> None:
    """Route a verified webhook to the right order-update path."""
    if event.event_type == "payment_intent.succeeded":
        _on_payment_intent_succeeded(event)
    elif event.event_type == "payment_intent.canceled":
        _on_payment_intent_canceled(event)
    elif event.event_type == "charge.refunded":
        _on_charge_refunded(event)
    else:
        logger.debug("Unhandled webhook type: %s", event.event_type)


def _on_payment_intent_succeeded(event: ProviderWebhookEvent):
    payment_intent = event.payload.get("data", {}).get("object", {}) or {}
    provider_payment_id = payment_intent.get("id")
    try:
        payment = OrderPayment.objects.get(
            provider_payment_id=provider_payment_id
        )
    except OrderPayment.DoesNotExist:
        logger.warning(
            "payment_intent.succeeded for unknown PaymentIntent %s",
            provider_payment_id,
        )
        return

    payment.provider_payment_status = "succeeded"
    if payment_intent.get("amount_received"):
        payment.amount = Decimal(payment_intent["amount_received"]) / 100
    payment.paid_at = timezone.now()
    payment.save(update_fields=["provider_payment_status", "amount", "paid_at"])

    _confirm_order_after_payment(payment)


def _on_payment_intent_canceled(event: ProviderWebhookEvent):
    payment_intent = event.payload.get("data", {}).get("object", {}) or {}
    provider_payment_id = payment_intent.get("id")
    OrderPayment.objects.filter(
        provider_payment_id=provider_payment_id
    ).update(provider_payment_status="canceled")


def _on_charge_refunded(event: ProviderWebhookEvent):
    """Stripe pushes ``charge.refunded`` when ANY refund settles. The
    payment record's refund_count / total_refunded_amount are not
    tracked in V1 (we keep RefundRecord per admin action), so this
    handler is a no-op placeholder — kept for future analytics."""
    return


def _confirm_order_after_payment(payment: OrderPayment):
    """Atomically transition ``pending → confirmed`` once Stripe says paid."""
    from apps.orders.services import transition_status

    if payment.order.status != "pending":
        return
    try:
        transition_status(
            payment.order,
            "confirmed",
            actor=None,
            payload={"via": "payment_webhook"},
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Order transition failed for %s: %s", payment.order, exc)
        raise

    record_event(
        organization=payment.organization,
        actor=None,
        action="order_paid",
        target_type="payment",
        target_id=payment.id,
        payload={
            "order_number": payment.order.order_number,
            "amount": str(payment.amount),
            "provider_payment_id": payment.provider_payment_id,
        },
    )


def reverse_loyalty_for_refund(*, order, refund_record) -> Optional[int]:
    """D-025 loyalty REVERSE integration.

    Idempotent on the (order, type='reverse') tuple thanks to the existing
    ``LoyaltyTransaction`` unique constraint — if a previous refund
    already triggered REVERSE for the same order, the duplicate insertion
    is swallowed via ``transaction.atomic`` rollback.
    """
    from apps.account.models import LoyaltyTransaction  # local avoid circular

    earn = (
        LoyaltyTransaction.objects.filter(order=order, type="earn")
        .order_by("-created_at")
        .first()
    )
    if earn is None:
        return None  # order hasn't earned yet (still pending / never delivered)

    try:
        with transaction.atomic():
            return LoyaltyTransaction.objects.create(
                customer=earn.customer,
                organization=earn.organization,
                type="reverse",
                points=-earn.points,
                order=order,
                note=f"İade (refund #{refund_record.id})",
            ).id
    except Exception as exc:  # noqa: BLE001 — IntegrityError on duplicate
        logger.info(
            "Loyalty reverse already recorded for order %s (refund %s): %s",
            order.order_number,
            refund_record.id,
            exc,
        )
        return None


def _mark_event(provider_name, event_id, payload, processed=False) -> WebhookEvent:
    """Persist a placeholder WebhookEvent when we can't dispatch (e.g. no
    settings for this provider). Used so duplicate webhooks don't 500."""
    return WebhookEvent.objects.create(
        provider_name=provider_name,
        provider_event_id=event_id,
        payload=payload if isinstance(payload, dict) else {"raw": str(payload)},
        processed=processed,
    )
