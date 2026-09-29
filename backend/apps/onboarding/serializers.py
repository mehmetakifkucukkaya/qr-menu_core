"""Onboarding serializers — Sprint C3."""

from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers


class OnboardingItemSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    price = serializers.DecimalField(max_digits=10, decimal_places=2)
    description = serializers.CharField(
        max_length=2000, required=False, allow_blank=True, default=""
    )


class OnboardingCompleteSerializer(serializers.Serializer):
    category_name = serializers.CharField(max_length=60)
    category_icon = serializers.CharField(max_length=8, required=False, default="🍽️")
    items = OnboardingItemSerializer(many=True, required=False, default=list)
    skip_items = serializers.BooleanField(required=False, default=False)

    def validate(self, attrs):
        skip = attrs.get("skip_items", False)
        items = attrs.get("items", [])
        if not skip and not items:
            raise serializers.ValidationError(
                "skip_items=False olduğunda en az 1 ürün gerekli."
            )
        if skip and items:
            raise serializers.ValidationError(
                "skip_items=True iken items listesi boş olmalı."
            )
        # Normalize Decimal precision — strip trailing zeros for stable hash.
        for it in items:
            it["price"] = Decimal(it["price"]).quantize(Decimal("0.01"))
        return attrs


class DemoSeedResponseSerializer(serializers.Serializer):
    categories_copied = serializers.IntegerField()
    items_copied = serializers.IntegerField()
    skipped = serializers.BooleanField()


class FirstQRResponseSerializer(serializers.Serializer):
    """Response for POST /api/v1/qr-codes/first/ — short QR summary for
    the wizard's "İlk QR'ı indir" step."""

    id = serializers.IntegerField()
    slug = serializers.CharField()
    png_url = serializers.URLField(required=False, allow_blank=True)
    target_url = serializers.URLField()


class TrialStatusSerializer(serializers.Serializer):
    """GET /api/v1/onboarding/trial-status/ — used by TrialBanner."""

    in_trial = serializers.BooleanField()
    plan = serializers.CharField()
    trial_started_at = serializers.DateTimeField(allow_null=True)
    trial_ends_at = serializers.DateTimeField(allow_null=True)
    days_remaining = serializers.IntegerField(allow_null=True)
