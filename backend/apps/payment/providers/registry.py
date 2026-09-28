"""Provider registry — D-026 (Sprint 11A).

A single ``get_provider_for_org(org)`` factory returns a fresh
``PaymentProvider`` instance per request. We DO NOT cache the provider on
the org / settings rows — crypto-derived credentials live in memory only
and a long-lived cache would defeat the at-rest guarantee.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError

from .iyzico import IyzicoProvider
from .stripe import StripeProvider

PROVIDERS = {
    "stripe": StripeProvider,
    "iyzico": IyzicoProvider,
}


def get_provider_for_org(organization) -> object:
    """Build a fresh ``PaymentProvider`` for ``organization``.

    * The tenant MUST have a ``PaymentSettings`` row (``is_enabled=True``).
    * The decrypted ``api_key`` is required for any provider call.
    * ``IyzicoProvider`` raises ``NotImplementedError`` for every
      operation today — V2 SaaS feature.

    Raises ``ValidationError`` with ``code='payment.not_configured'`` when
    the tenant has no live settings.
    """
    settings = getattr(organization, "payment_settings", None)
    if settings is None or not settings.is_enabled:
        raise ValidationError(
            "Bu tenant için ödeme ayarları tanımlı değil. /admin/payment/"
            "settings üzerinden provider seçin ve api_key girin."
        )
    provider_cls = PROVIDERS.get(settings.provider_name)
    if provider_cls is None:
        raise ValidationError(f"Bilinmeyen provider: {settings.provider_name}")

    api_key = settings.api_key  # property — decrypts
    webhook_secret = settings.webhook_secret  # property — decrypts

    if not api_key:
        raise ValidationError(
            f"PaymentSettings.api_key boş. Lütfen Stripe dashboard'tan "
            f"secret key alıp /admin/payment/settings üzerinden girin."
        )

    return provider_cls(
        api_key=api_key,
        webhook_secret=webhook_secret,
        is_test_mode=settings.is_test_mode,
    )
