"""Payment app models — D-026 (Sprint 11A).

4 modeller, hepsi tenant-scoped (D-022 standard):

* ``PaymentSettings`` — tenant-tied provider config (Stripe primary).
  ``api_key`` ve ``webhook_secret`` ciphertext olarak saklanır (Fernet).
  ``is_test_mode`` V1 default True; production'da ``False``.
* ``OrderPayment`` — bir Order'ın tek bir payment denemesi. ``OneToOne``
  olduğu için aynı order tek bir active payment'e sahip olur.
  ``provider_payment_id`` Stripe'ın ``pi_xxx`` ID'si.
* ``RefundRecord`` — partial / full iade kaydı. ``provider_refund_id``
  Stripe'ın ``re_xxx`` ID'si, unique idempotency guard.
* ``WebhookEvent`` — provider'dan gelen webhook olayı için idempotency
  cache. Aynı ``provider_event_id`` (Stripe ``evt_xxx``) iki kez gelirse
  webhook processor no-op döner.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import models

from apps.core.models import TimeStampedModel


class PaymentSettings(TimeStampedModel):
    """Tenant-level payment provider config.

    One row per active tenant (``OneToOne``). The Fernet-encrypted columns
    are write-only through the explicit ``set_api_key`` / ``set_webhook_secret``
    helpers; the ``api_key`` / ``webhook_secret`` properties decrypt on read
    and must never appear in ``serializer.to_representation()``.
    """

    PROVIDER_CHOICES = [
        ("stripe", "Stripe (primary — V1)"),
        ("iyzico", "iyzico (V2 SaaS — placeholder)"),
    ]

    organization = models.OneToOneField(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="payment_settings",
    )
    provider_name = models.CharField(
        max_length=16,
        choices=PROVIDER_CHOICES,
        default="stripe",
    )
    # Fernet-encrypted; see apps/payment/crypto.py. NEVER store plaintext here.
    api_key_encrypted = models.TextField(blank=True, default="")
    webhook_secret_encrypted = models.TextField(blank=True, default="")
    is_test_mode = models.BooleanField(default=True)
    is_enabled = models.BooleanField(default=False)

    def __str__(self) -> str:  # pragma: no cover
        return f"PaymentSettings<{self.organization_id}/{self.provider_name}>"

    # Transparent decryption on read. Access via these properties inside
    # service code; the serializer + admin form MUST mask the value.
    @property
    def api_key(self) -> str:
        from .crypto import decrypt

        return decrypt(self.api_key_encrypted)

    @property
    def webhook_secret(self) -> str:
        from .crypto import decrypt

        return decrypt(self.webhook_secret_encrypted)

    def set_api_key(self, raw: str) -> None:
        from .crypto import encrypt

        self.api_key_encrypted = encrypt(raw)

    def set_webhook_secret(self, raw: str) -> None:
        from .crypto import encrypt

        self.webhook_secret_encrypted = encrypt(raw)


class OrderPayment(TimeStampedModel):
    """A single payment attempt against an Order.

    One-to-one with ``Order`` — re-attempting payment for the same order
    should ``get_or_create`` on this table and update the existing row's
    Stripe ID, not create a duplicate row.
    """

    # Mirror the Stripe PaymentIntent.status enum so we can map webhook
    # events onto a normalised column without conditionals in services.
    PROVIDER_STATUS = [
        ("requires_payment_method", "Requires Payment Method"),
        ("requires_confirmation", "Requires Confirmation"),
        ("requires_action", "Requires Action (3DS)"),
        ("processing", "Processing"),
        ("requires_capture", "Requires Capture"),
        ("succeeded", "Succeeded"),
        ("canceled", "Canceled"),
    ]

    order = models.OneToOneField(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="payment",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="order_payments",
    )

    provider_name = models.CharField(max_length=16, default="stripe")
    provider_payment_id = models.CharField(max_length=128)
    provider_payment_status = models.CharField(
        max_length=32,
        choices=PROVIDER_STATUS,
        default="requires_payment_method",
    )

    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="TRY")
    paid_at = models.DateTimeField(null=True, blank=True)
    # Stripe response dump (capped; raw_response holds up to 8 KB).
    raw_response = models.JSONField(default=dict)

    def __str__(self) -> str:  # pragma: no cover
        return f"OrderPayment<{self.order_id}/{self.provider_name}/{self.provider_payment_id}>"

    class Meta:
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["provider_payment_id"]),
            models.Index(fields=["provider_payment_status"]),
        ]


class RefundRecord(TimeStampedModel):
    """A full or partial refund issued by the admin panel.

    Each ``provider_refund_id`` (Stripe ``re_xxx``) is unique — the natural
    primary key for idempotency on replay. Multiple refunds against the
    same payment are allowed (partial refund flow), each with its own
    provider_refund_id.
    """

    REASON_CHOICES = [
        ("customer_request", "Customer Request"),
        ("duplicate", "Duplicate charge"),
        ("fraudulent", "Fraudulent"),
    ]

    payment = models.ForeignKey(
        OrderPayment,
        on_delete=models.CASCADE,
        related_name="refunds",
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.CASCADE,
        related_name="refunds",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        related_name="refund_records",
    )

    provider_refund_id = models.CharField(max_length=128, unique=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.CharField(max_length=32, choices=REASON_CHOICES)
    initiated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    STATUS = [
        ("pending", "Pending"),
        ("succeeded", "Succeeded"),
        ("failed", "Failed"),
        ("canceled", "Canceled"),
    ]
    status = models.CharField(max_length=16, choices=STATUS, default="pending")

    class Meta:
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["payment", "-created_at"]),
        ]


class WebhookEvent(models.Model):
    """Stripe ``evt_xxx`` idempotency cache.

    A given Stripe webhook can be redelivered (provider retries on
    connection failure). We persist the event-id on first receipt and
    treat duplicates as no-op at the service layer — so the order /
    refund logic only ever fires once per logical Stripe event.
    """

    provider_name = models.CharField(max_length=16)
    provider_event_id = models.CharField(max_length=128)
    payload = models.JSONField(default=dict)
    received_at = models.DateTimeField(auto_now_add=True)
    processed = models.BooleanField(default=False)
    error = models.TextField(blank=True, default="")

    class Meta:
        unique_together = (("provider_name", "provider_event_id"),)
        indexes = [models.Index(fields=["provider_name", "-received_at"])]
