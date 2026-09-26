"""Analytics hashing helpers — Sprint 5A / D-017.

All identifiers that could tie an event back to a single real-world
visitor — IP address, User-Agent — must be stored only as a salted hash.
A pure SHA-256 isn't enough because IP/UA strings have low entropy: an
attacker with read access to the DB could brute-force the small IP
space; prepending the per-deployment salt makes that much harder.

The salt comes from ``settings.ANALYTICS_SALT`` with a built-in dev
default. Production must override the env var with a 32+ char random
token (see ``.env.example``).
"""

from __future__ import annotations

import hashlib

from django.conf import settings


def get_analytics_salt() -> str:
    """Return the configured salt (with a dev-only fallback)."""
    return getattr(
        settings,
        "ANALYTICS_SALT",
        "qr-menu-default-salt-change-me",
    )


def hash_value(value: str | None, *, length: int = 64) -> str:
    """Return ``sha256(salt + ':' + value)`` truncated to ``length`` chars.

    ``length`` defaults to 64 (full SHA-256 hex). Truncation is a single
    place to dial down size if we ever index a billion rows; sha256's
    avalanche property keeps the leading bits well-mixed even when
    shortened.
    """
    if value is None:
        value = ""
    salt = get_analytics_salt()
    digest = hashlib.sha256(f"{salt}:{value}".encode("utf-8")).hexdigest()
    return digest[:length]


def client_ip(request) -> str:
    """Best-effort client IP.

    Honors ``X-Forwarded-For`` (first hop) when present (Cloudflare /
    Caddy), falls back to ``REMOTE_ADDR``. Tests run with empty META so
    this returns empty string — that's fine, the hash is still salted.
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if xff:
        ip = xff.split(",")[0].strip()
        if ip:
            return ip
    return request.META.get("REMOTE_ADDR", "") or ""


def user_agent(request) -> str:
    return request.META.get("HTTP_USER_AGENT", "") or ""
