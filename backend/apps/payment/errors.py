"""Payment app exception types — D-026.

Distinct from generic DRF exceptions so the payment view can map each
case to the right HTTP status:

* ``PaymentProviderUnavailable`` — 502 ``payment.provider_unavailable``
* ``PaymentSettingMissing``      — 400 ``payment.not_configured``
* ``PaymentInvalidSignature``    — 401 ``payment.invalid_signature``
"""

from __future__ import annotations


class PaymentProviderUnavailable(Exception):
    """Provider is unreachable (e.g. Stripe 5xx or network error)."""


class PaymentSettingMissing(Exception):
    """Tenant has no PaymentSettings configured (or is_enabled=False)."""


class PaymentInvalidSignature(Exception):
    """Webhook signature did not match the configured secret."""
