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


class OnboardingPreferencesSerializer(serializers.Serializer):
    """Step 2 of the wizard — the languages and the currency.

    The wizard collects these *after* the account exists (step 1 creates
    the tenant), so they could not travel with the signup payload: they
    were displayed on the summary screen and then dropped on the floor.
    This endpoint persists them for the tenant of the signed-in user.

    The validation mirrors ``apps.accounts.serializers.SignupSerializer``
    so a tenant cannot end up in a state the signup path would have
    rejected: the default language must be among the supported ones, at
    most 8 languages, and the currency must be one of the four the product
    supports.
    """

    default_locale = serializers.CharField(max_length=8, default="tr")
    supported_locales = serializers.ListField(
        child=serializers.CharField(max_length=8),
        min_length=1,
        max_length=8,
        default=["tr", "en"],
    )
    currency = serializers.ChoiceField(
        choices=["TRY", "EUR", "USD", "GBP"],
        default="TRY",
    )

    def validate(self, attrs):
        supported = [v.lower() for v in attrs.get("supported_locales", [])]
        default = attrs.get("default_locale", "tr").lower()
        if default not in supported:
            raise serializers.ValidationError(
                "default_locale, supported_locales listesinde olmalı."
            )
        attrs["default_locale"] = default
        attrs["supported_locales"] = supported
        return attrs


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
