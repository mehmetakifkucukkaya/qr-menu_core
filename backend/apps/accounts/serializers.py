"""Serializers for accounts app (login, current user, signup)."""

from __future__ import annotations

import re

from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.organizations.models import Organization

from .models import User


_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class UserSerializer(serializers.ModelSerializer):
    """Lightweight user representation for /api/v1/me."""

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "full_name",
            "role",
            "is_active",
            "is_staff",
            "is_superuser",
            "date_joined",
            "created_at",
        )


class SignupSerializer(serializers.Serializer):
    """Sprint C1 — self-serve onboarding step 1.

    Validates a brand-new tenant signup. The atomic ``User +
    Organization + Membership + PlanSettings(BASIC)`` creation happens
    in :class:`apps.accounts.auth_views.SignupView` so we keep the
    DB transaction boundary outside the serializer.
    """

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    full_name = serializers.CharField(max_length=120, required=False, allow_blank=True)

    # Business fields.
    business_name = serializers.CharField(max_length=160)
    slug = serializers.RegexField(
        regex=r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$",
        max_length=40,
        help_text="URL-safe tenant slug — lowercase letters, digits, hyphens.",
    )

    # Locale + currency.
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

    def validate_email(self, value: str) -> str:
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "Bu email zaten kayıtlı. Giriş yapmayı deneyin."
            )
        return value.lower()

    def validate_slug(self, value: str) -> str:
        if Organization.objects.filter(slug=value).exists():
            raise serializers.ValidationError(
                "Bu slug zaten kullanımda. Farklı bir slug deneyin."
            )
        if value in {"admin", "api", "www", "static", "media", "signup"}:
            raise serializers.ValidationError(
                "Bu slug sistem için ayrılmış. Farklı bir slug deneyin."
            )
        return value

    def validate_supported_locales(self, value: list[str]) -> list[str]:
        # Default locale must appear in supported_locales.
        default = self.initial_data.get("default_locale", "tr")
        if default not in value:
            raise serializers.ValidationError(
                "default_locale, supported_locales listesinde olmalı."
            )
        return [v.lower() for v in value]

    def validate_password(self, value: str) -> str:
        validate_password(value, self.instance)
        return value


class SignupResponseSerializer(serializers.Serializer):
    """Signup success payload — returned by SignupView after atomic create."""

    user = UserSerializer(read_only=True)
    organization_id = serializers.IntegerField(read_only=True)
    organization_slug = serializers.CharField(read_only=True)
    organization_name = serializers.CharField(read_only=True)
    plan = serializers.CharField(read_only=True)
    membership_role = serializers.CharField(read_only=True)


class SlugAvailabilitySerializer(serializers.Serializer):
    """Response for GET /api/v1/auth/check-slug/?slug=<value>."""

    slug = serializers.CharField(read_only=True)
    available = serializers.BooleanField(read_only=True)
    reason = serializers.CharField(read_only=True, required=False, default="")
