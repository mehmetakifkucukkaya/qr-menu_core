"""Fernet-based symmetric encryption helpers for payment credentials at rest.

D-026: ``PaymentSettings.api_key`` and ``PaymentSettings.webhook_secret``
columns store Fernet ciphertext (instead of plaintext). The encryption key
is loaded from ``settings.PAYMENT_FERNET_KEY`` — a 32-byte url-safe base64
string. Generate with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Behavior
--------
- **Production**: ``PAYMENT_FERNET_KEY`` is set via env. ``crypto.encrypt``
  + ``crypto.decrypt`` use the loaded key — neither plaintext leaves memory
  in any response payload and only ciphertext is written to the database.
- **Development + tests**: if the env var is unset, an ephemeral key is
  generated on first access and a one-shot ``RuntimeWarning`` is logged.
  This keeps ``python3 -m pytest`` green without giving operators a way
  to skip configuring the key. **Never run production with an unset key**;
  restart-with-different-key invalidates all stored credentials and forces
  every tenant to re-enter their Stripe key — exactly what we want when
  rotating an exposed secret.
"""

from __future__ import annotations

import warnings
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class PaymentCryptoError(Exception):
    """Raised when Fernet encryption/decryption fails (wrong key, corrupted
    ciphertext). Re-raised as ``PaymentCryptoError`` so callers don't need to
    import ``cryptography`` directly."""


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    """Lazy-loaded Fernet instance, cached for the process lifetime."""
    key = getattr(settings, "PAYMENT_FERNET_KEY", "") or ""
    if not key:
        warnings.warn(
            "PAYMENT_FERNET_KEY is not set; generating an ephemeral key for "
            "this process. Stored ciphertext will become unreadable on "
            "process restart — set PAYMENT_FERNET_KEY in production.",
            RuntimeWarning,
            stacklevel=2,
        )
        key = Fernet.generate_key()
    if isinstance(key, str):
        key = key.encode("ascii")
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    """Encrypt a UTF-8 string and return a Fernet token (url-safe base64)."""
    if not isinstance(plaintext, str):
        raise TypeError("encrypt() expects a str plaintext")
    if plaintext == "":
        # Avoid encrypting an empty string — would still produce a valid
        # token but downstream callers can mistake the empty input for the
        # "unconfigured" sentinel.
        return ""
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt(ciphertext: str) -> str:
    """Decrypt a Fernet token back to its plaintext UTF-8 string."""
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except InvalidToken as exc:
        raise PaymentCryptoError(
            "Could not decrypt payment credential — the configured Fernet "
            "key does not match the one that encrypted this value. Reset "
            "the tenant's payment credentials."
        ) from exc
