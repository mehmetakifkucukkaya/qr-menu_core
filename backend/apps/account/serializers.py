"""Account serializers — Sprint 10A (D-025).

Serializers split into three groups:

* ``MagicLinkSerializer`` — request-side validation (email required).
* ``CustomerProfileSerializer`` — read/update of ``full_name`` /
  ``phone``. Email is read-only (it is the canonical identity and
  changing it would invalidate the magic-link issuance table).
* ``LoyaltyReadSerializer`` + ``LoyaltySettingsSerializer`` — public
  + admin reads of org-level loyalty config.

We deliberately avoid DRF ``ModelSerializer`` for the public-facing
``me`` payload — the customer-facing JSON contract picks exactly
which fields to expose (``full_name``, ``phone``, ``created_at`` —
NOT ``is_active``, the magic-link count, or any other internal
column). Keeping it explicit makes the contract grep-able.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import Customer, LoyaltySettings, LoyaltyTransaction


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class MagicLinkRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254, required=True)

    def validate_email(self, value: str) -> str:
        return value.strip().lower()


class MagicLinkVerifySerializer(serializers.Serializer):
    """Body for POST-style verify. ``GET ?token=...`` uses query params."""

    token = serializers.CharField(max_length=64, required=True, trim_whitespace=True)


# ---------------------------------------------------------------------------
# Customer profile
# ---------------------------------------------------------------------------
class CustomerProfileSerializer(serializers.ModelSerializer):
    """Read representation for ``/api/v1/account/me``."""

    class Meta:
        model = Customer
        fields = ("id", "email", "full_name", "phone", "created_at", "last_login_at")
        read_only_fields = ("id", "email", "created_at", "last_login_at")


class CustomerProfileUpdateSerializer(serializers.ModelSerializer):
    """Write serializer for PATCH /api/v1/account/me.

    Only ``full_name`` and ``phone`` are mutable. ``email`` and
    ``is_active`` are intentionally absent — email change would
    invalidate prior magic-link audit; status change is admin-only.
    """

    class Meta:
        model = Customer
        fields = ("full_name", "phone")
        extra_kwargs = {
            "full_name": {"required": False, "allow_blank": True, "max_length": 120},
            "phone": {"required": False, "allow_blank": True, "max_length": 20},
        }


# ---------------------------------------------------------------------------
# Loyalty (read shapes)
# ---------------------------------------------------------------------------
class LoyaltyTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoyaltyTransaction
        fields = (
            "id",
            "type",
            "points",
            "order",
            "note",
            "created_at",
        )
        read_only_fields = fields


class LoyaltyReadSerializer(serializers.Serializer):
    """Top-level payload for ``GET /api/v1/account/me/loyalty``.

    ``balance`` is computed by the view (signed-int sum). The
    ``transactions`` list is the most-recent ``TRANSACTION_PAGE_SIZE``
    rows for the requested customer+org.
    """

    balance = serializers.IntegerField(min_value=0, read_only=True)
    transactions = LoyaltyTransactionSerializer(many=True, read_only=True)


class PublicLoyaltySettingsSerializer(serializers.ModelSerializer):
    """Public-facing loyalty settings (no admin-only fields)."""

    class Meta:
        model = LoyaltySettings
        fields = (
            "is_enabled",
            "points_per_currency_unit",
            "redemption_rate",
            "min_points_to_redeem",
        )
        read_only_fields = fields


class AdminLoyaltySettingsSerializer(serializers.ModelSerializer):
    """Admin-facing loyalty settings — full read/write.

    All five configurable fields plus ``is_enabled``. Validation
    keeps the rates sane (positive decimal, integer threshold,
    expiry days >= 1).
    """

    class Meta:
        model = LoyaltySettings
        fields = (
            "is_enabled",
            "points_per_currency_unit",
            "redemption_rate",
            "min_points_to_redeem",
            "points_expiry_days",
        )
        extra_kwargs = {
            "is_enabled": {"required": False},
            "points_per_currency_unit": {"required": False},
            "redemption_rate": {"required": False},
            "min_points_to_redeem": {"required": False},
            "points_expiry_days": {"required": False, "allow_null": True},
        }

    def validate_points_per_currency_unit(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError(
                "Puan oranı sıfırdan büyük olmalı."
            )
        return value

    def validate_redemption_rate(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError(
                "Harcama oranı sıfırdan büyük olmalı."
            )
        return value

    def validate_min_points_to_redeem(self, value):
        if value is None or value < 1:
            raise serializers.ValidationError(
                "Minimum harcama eşiği en az 1 olmalı."
            )
        return value

    def validate_points_expiry_days(self, value):
        if value is not None and value < 1:
            raise serializers.ValidationError(
                "Geçerlilik süresi 1 veya daha büyük olmalı."
            )
        return value


# ---------------------------------------------------------------------------
# Admin customer payloads
# ---------------------------------------------------------------------------
class CustomerAdminSummarySerializer(serializers.ModelSerializer):
    """Row shape for ``GET /api/v1/admin/customers``."""

    loyalty_balance = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            "id",
            "email",
            "full_name",
            "phone",
            "is_active",
            "created_at",
            "last_login_at",
            "loyalty_balance",
        )
        read_only_fields = fields

    def get_loyalty_balance(self, obj) -> int:
        # Pre-computed by the view via ``customer_balance`` for the
        # active organization; passed through ``context``.
        return int(self.context.get("balances", {}).get(obj.id, 0))


class LoyaltyAdjustSerializer(serializers.Serializer):
    delta_points = serializers.IntegerField()
    note = serializers.CharField(
        max_length=500, required=False, allow_blank=True, default=""
    )

    def validate_delta_points(self, value):
        if value == 0:
            raise serializers.ValidationError("Düzeltme sıfır olamaz.")
        return value
