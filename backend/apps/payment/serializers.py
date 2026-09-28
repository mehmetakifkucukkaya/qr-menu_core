"""Payment app DRF serializers — D-026.

The ``api_key`` field is write-only and the read value is always masked,
so a curl peek / browser devtools dump can never reveal the encrypted
secret. ``mask=True`` is the default — even a privileged admin UI shows
just the last 4 chars.
"""

from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from .models import (
    OrderPayment,
    PaymentSettings,
    RefundRecord,
    WebhookEvent,
)


class MaskedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """Returns ``***masked***`` for sensitive primary-key relations."""

    def to_representation(self, value):
        return "***masked***"


class PaymentSettingsSerializer(serializers.ModelSerializer):
    """Public read API for tenant payment settings.

    ``api_key`` and ``webhook_secret`` are write-only. The read response
    shows ``api_key_masked`` (last 4 chars) and never the actual value.
    """

    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    webhook_secret = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_key_masked = serializers.SerializerMethodField()
    webhook_secret_masked = serializers.SerializerMethodField()

    class Meta:
        model = PaymentSettings
        fields = [
            "id",
            "organization",
            "provider_name",
            "is_enabled",
            "is_test_mode",
            "api_key",
            "webhook_secret",
            "api_key_masked",
            "webhook_secret_masked",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organization",
            "api_key_masked",
            "webhook_secret_masked",
            "created_at",
            "updated_at",
        ]

    @staticmethod
    def _mask(ciphertext: str) -> str:
        if not ciphertext:
            return ""
        # Fernet tokens are long base64 strings — there's no plaintext to
        # mask. Show "set" / "not set" plus an immutable suffix.
        if ciphertext == "":
            return ""
        return f"***** (encrypted {len(ciphertext)} chars)"

    def get_api_key_masked(self, obj) -> str:
        return self._mask(obj.api_key_encrypted)

    def get_webhook_secret_masked(self, obj) -> str:
        return self._mask(obj.webhook_secret_encrypted)

    def create(self, validated_data):
        raw_key = validated_data.pop("api_key", "")
        raw_secret = validated_data.pop("webhook_secret", "")
        instance = super().create(validated_data)
        if raw_key:
            instance.set_api_key(raw_key)
        if raw_secret:
            instance.set_webhook_secret(raw_secret)
        instance.save()
        return instance

    def update(self, instance, validated_data):
        raw_key = validated_data.pop("api_key", None)
        raw_secret = validated_data.pop("webhook_secret", None)
        instance = super().update(instance, validated_data)
        if raw_key is not None and raw_key != "":
            instance.set_api_key(raw_key)
        if raw_secret is not None and raw_secret != "":
            instance.set_webhook_secret(raw_secret)
        instance.save()
        return instance


class CreatePaymentIntentSerializer(serializers.Serializer):
    """Body for ``POST /public/orders/{number}/pay/`` — empty for V1.

    The customer email is optional and only attached to receipt metadata
    when Stripe Email Receipts is enabled in the dashboard.
    """

    customer_email = serializers.EmailField(required=False, allow_blank=True)


class OrderPaymentPublicSerializer(serializers.ModelSerializer):
    """Public response — payment_intent client_secret is required for
    Stripe Elements on the FE."""

    client_secret = serializers.SerializerMethodField()

    class Meta:
        model = OrderPayment
        fields = [
            "id",
            "order",
            "organization",
            "provider_name",
            "provider_payment_id",
            "provider_payment_status",
            "amount",
            "currency",
            "paid_at",
            "client_secret",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_client_secret(self, obj) -> str:
        return obj.raw_response.get("client_secret", "")


class PaymentStatusPublicSerializer(serializers.ModelSerializer):
    """Lighter public response for ``GET /public/orders/{number}/payment/``."""

    class Meta:
        model = OrderPayment
        fields = [
            "provider_name",
            "provider_payment_id",
            "provider_payment_status",
            "amount",
            "currency",
            "paid_at",
        ]


class RefundCreateSerializer(serializers.Serializer):
    order_number = serializers.CharField(max_length=32)
    amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    reason = serializers.ChoiceField(
        choices=[c[0] for c in RefundRecord.REASON_CHOICES]
    )


class RefundRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefundRecord
        fields = [
            "id",
            "payment",
            "order",
            "organization",
            "provider_refund_id",
            "amount",
            "reason",
            "status",
            "initiated_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class SettlementSummarySerializer(serializers.Serializer):
    """Today's + week + month + all-time aggregates."""

    today = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    week = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    month = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    all_time = serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    by_provider = serializers.DictField(
        child=serializers.DictField(child=serializers.DecimalField(max_digits=12, decimal_places=2))
    )


class PaymentProviderTestSerializer(serializers.Serializer):
    """Output for ``POST /admin/payment/settings/test/``."""

    provider_name = serializers.CharField()
    test_ok = serializers.BooleanField()
    message = serializers.CharField()


class ReconcileResultSerializer(serializers.Serializer):
    """Output for ``POST /admin/payment/reconcile/``."""

    reconciled = serializers.IntegerField()
    scanned = serializers.IntegerField()


class WebhookEventSerializer(serializers.ModelSerializer):
    """Read-only debug view of received webhooks (admin-only)."""

    class Meta:
        model = WebhookEvent
        fields = [
            "id",
            "provider_name",
            "provider_event_id",
            "received_at",
            "processed",
            "error",
        ]
