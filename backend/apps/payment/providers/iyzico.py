"""iyzico adapter — V2 SaaS placeholder (D-026).

The V1 demo exclusively uses Stripe. ``IyzicoProvider`` exists so the
registry has a stable lookup table today (``PROVIDERS['iyzico']``), and
so the Sprint 13+ iyzico work has an explicit seam — the only thing
left to do is replace the four ``NotImplementedError`` raises with real
API calls against ``iyzico-python``.

Real implementation will need:
* Sandbox + live base URLs (``api.iyzipay.com`` for live).
* API + secret + merchant key auth via ``IyzicoSettings``.
* A Turkish-locale 3DS challenge wrapper (iyzico's BIN detection
  surfaces 3DS 1.0 vs 2.0 differently than Stripe).
* Currency hardcoded to ``TRY`` (iyzico doesn't accept multi-currency).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from .base import (
    InvalidSignatureError,
    PaymentIntent,
    PaymentProvider,
    PaymentStatus,
    RefundReceipt,
    WebhookEvent,
)


class IyzicoProvider(PaymentProvider):
    """iyzico — Türkiye için V2 SaaS feature.

    Bu sınıf V1 demo'da KULLANILMAZ (Stripe primary). Her metot
    ``NotImplementedError`` fırlatır — service katmanı sadece
    PaymentSettings.provider_name == 'iyzico' olan tenantlar için
    çağırır ve gerçek implementasyon Sprint 13+ olarak planlanmış.
    """

    name = "iyzico"

    def __init__(
        self,
        *,
        api_key: str = "",
        webhook_secret: str = "",
        is_test_mode: bool = True,
    ):
        # Same keyword signature as StripeProvider: the registry builds every
        # provider as ``cls(api_key=..., webhook_secret=..., is_test_mode=...)``.
        # With no __init__ this raised ``TypeError: IyzicoProvider() takes no
        # arguments`` for any tenant that picked iyzico (/pay -> 502, refund ->
        # 500). Constructing is now fine; every operation still raises
        # NotImplementedError, which the service layer maps to a clean 502.
        self.api_key = api_key
        self.webhook_secret = webhook_secret
        self.is_test_mode = is_test_mode

    def create_payment_intent(
        self,
        *,
        amount: Decimal,
        currency: str,
        metadata: dict,
    ) -> PaymentIntent:
        raise NotImplementedError(
            "iyzico provider is a V2 SaaS feature (Sprint 13+). "
            "Şu an sadece Stripe primary kullanılıyor. "
            "PaymentSettings.provider_name='stripe' olarak ayarlayın."
        )

    def retrieve_payment(self, provider_payment_id: str) -> PaymentStatus:
        raise NotImplementedError("iyzico provider is V2 SaaS")

    def refund(
        self,
        *,
        provider_payment_id: str,
        amount: Optional[Decimal] = None,
        reason: str = "admin_action",
    ) -> RefundReceipt:
        raise NotImplementedError("iyzico provider is V2 SaaS")

    def verify_webhook(self, *, payload: bytes, signature_header: str) -> WebhookEvent:
        raise NotImplementedError("iyzico provider is V2 SaaS")


# Suppress unused-import warning for ``InvalidSignatureError`` — surface
# only when a real subclass overrides ``verify_webhook``. Kept for the
# future iyzico implementation.
_ = InvalidSignatureError
