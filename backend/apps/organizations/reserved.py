"""Slugs no business may claim.

A tenant slug is a public URL segment (``/m/<slug>``) and, in time, a host
name. These names are routes, hosts or fixtures of the platform itself. One
list serves self-serve signup (serializer and availability check) and the
agency's ``apps.onboarding.provisioning.provision_tenant``.
"""

from __future__ import annotations

RESERVED_SLUGS = frozenset(
    {
        "account",
        "admin",
        "api",
        "auth",
        "demo",
        "django-admin",
        "docs",
        "health",
        "login",
        "m",
        "media",
        "modern-cafe",
        "signup",
        "static",
        "_next",
        "www",
    }
)


def is_reserved(slug: str) -> bool:
    """True for a name the platform keeps for itself (case and padding ignored)."""
    return (slug or "").strip().lower() in RESERVED_SLUGS
