"""Payment provider implementations — D-026 (Sprint 11A).

* ``StripeProvider`` — full implementation; primary for V1.
* ``IyzicoProvider`` — V2 SaaS placeholder; raises ``NotImplementedError``
  on every operation. Kept so the provider registry has a stable lookup
  table today, and so the Sprint 13+ iyzico work has a clear seam.
"""

from .base import (
    InvalidSignatureError,
    PaymentIntent,
    PaymentProvider,
    PaymentStatus,
    RefundReceipt,
    WebhookEvent,
)
from .iyzico import IyzicoProvider
from .registry import PROVIDERS, get_provider_for_org
from .stripe import StripeProvider

__all__ = [
    "InvalidSignatureError",
    "PaymentIntent",
    "PaymentProvider",
    "PaymentStatus",
    "RefundReceipt",
    "WebhookEvent",
    "IyzicoProvider",
    "StripeProvider",
    "PROVIDERS",
    "get_provider_for_org",
]
