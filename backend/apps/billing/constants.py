"""Billing constants — plan tiers, limit numbers, plan-name keys.

Source of truth for the 4-tier pricing matrix used by both
``services.py`` (enforcement) and ``serializers.py`` (admin
display). V1 keeps the matrix as a Python constant — we can swap to
a ``PlanTierLimit`` DB row in V2 SaaS when tier prices change more
often than once per quarter.

Design notes (D-026):

* Plan tiers are short string keys (``basic`` / ``pro`` / ``orders``
  / ``ops``) — CharField max_length=8 to leave room for V2 additions
  (``ent``, ``ent_plus``, etc.) without a schema migration.
* A ``None`` limit means "unlimited" — V1 demos use this on the OPS
  tier for resource counts (items, categories, branches) to signal
  "you've hit the top tier, the only cap is your hardware".
* Features are 9 explicit booleans (not an M2M / JSONField) — keeps
  the schema stable for the admin UI's checkbox grid (Sprint B2)
  and makes the per-flag audit easier to write.
"""

from __future__ import annotations

from typing import Final


# ---------------------------------------------------------------------------
# Plan identifiers
# ---------------------------------------------------------------------------

BASIC: Final = "basic"
PRO: Final = "pro"
ORDERS: Final = "orders"
OPS: Final = "ops"

PLAN_CHOICES: Final = [
    (BASIC, "QR Menü Basic"),
    (PRO, "QR Menü Pro"),
    (ORDERS, "QR Sipariş"),
    (OPS, "Restoran Ops"),
]

# Ordered list for display (low → high).
PLAN_TIER_ORDER: Final = [BASIC, PRO, ORDERS, OPS]


# ---------------------------------------------------------------------------
# Tier limit matrix
# ---------------------------------------------------------------------------
# Each entry has:
#   - label: human-readable tier name (already in PLAN_CHOICES, repeated
#     here for downstream admin UI rendering)
#   - items / categories / branches / locales: count caps
#   - monthly_views / monthly_scans: monthly aggregate caps
#   - ai_pdf_imports / ai_translate_ops / ai_description_ops: monthly AI caps
#   - features: default-feature dict — overridden by PlanSettings rows
#
# ``None`` for a resource = unlimited (V1 OPS tier for items / categories /
# branches).

PLAN_TIER_LIMITS: Final = {
    BASIC: {
        "label": "QR Menü Basic",
        "items": 25,
        "categories": 5,
        "branches": 2,
        "locales": 2,
        "monthly_views": 1_000,
        "monthly_scans": 500,
        "ai_pdf_imports": 0,
        "ai_translate_ops": 0,
        "ai_description_ops": 0,
        "features": {
            "cart_enabled": False,
            "orders_enabled": False,
            "loyalty_enabled": False,
            "customer_accounts_enabled": False,
            "payments_enabled": False,
            "ai_pdf_import_enabled": False,
            "ai_translate_enabled": False,
            "advanced_analytics_enabled": False,
        },
    },
    PRO: {
        "label": "QR Menü Pro",
        "items": 100,
        "categories": 20,
        "branches": 5,
        "locales": 4,
        "monthly_views": 25_000,
        "monthly_scans": 5_000,
        "ai_pdf_imports": 10,
        "ai_translate_ops": 100,
        "ai_description_ops": 100,
        "features": {
            "cart_enabled": False,
            "orders_enabled": False,
            "loyalty_enabled": False,
            "customer_accounts_enabled": False,
            "payments_enabled": False,
            "ai_pdf_import_enabled": True,
            "ai_translate_enabled": True,
            "advanced_analytics_enabled": True,
        },
    },
    ORDERS: {
        "label": "QR Sipariş",
        "items": 200,
        "categories": 50,
        "branches": 10,
        "locales": 8,
        "monthly_views": 100_000,
        "monthly_scans": 25_000,
        "ai_pdf_imports": 50,
        "ai_translate_ops": 1_000,
        "ai_description_ops": 1_000,
        "features": {
            "cart_enabled": True,
            "orders_enabled": True,
            "loyalty_enabled": False,
            "customer_accounts_enabled": False,
            "payments_enabled": False,
            "ai_pdf_import_enabled": True,
            "ai_translate_enabled": True,
            "advanced_analytics_enabled": True,
        },
    },
    OPS: {
        "label": "Restoran Ops",
        "items": None,  # unlimited
        "categories": None,
        "branches": None,
        "locales": 8,
        "monthly_views": 1_000_000,
        "monthly_scans": 250_000,
        "ai_pdf_imports": 500,
        "ai_translate_ops": 50_000,
        "ai_description_ops": 50_000,
        "features": {
            "cart_enabled": True,
            "orders_enabled": True,
            "loyalty_enabled": True,
            "customer_accounts_enabled": True,
            "payments_enabled": True,
            "ai_pdf_import_enabled": True,
            "ai_translate_enabled": True,
            "advanced_analytics_enabled": True,
        },
    },
}


# ---------------------------------------------------------------------------
# Feature / resource catalogs
# ---------------------------------------------------------------------------

# 9 explicit feature flags — used by ``PlanSettings.effective_features()``
# and ``has_feature()`` service. Listed explicitly so callers don't have
# to introspect the model class at runtime (faster lookups, easier to
# cross-check against the admin UI in Sprint B2).
def platform_forced_off() -> frozenset:
    """Feature flags the PLATFORM has switched off for every tenant.

    Today only ``payments_enabled``: while ``settings.PAYMENTS_ENABLED`` is False
    the payment module is dark (see ``apps.payment.permissions``), so no tenant
    may be told - or let its checkout assume - that online payment works,
    whatever its plan row says.
    """
    from django.conf import settings

    off = set()
    if not getattr(settings, "PAYMENTS_ENABLED", False):
        off.add("payments_enabled")
    return frozenset(off)


FEATURE_FIELDS: Final = (
    "cart_enabled",
    "orders_enabled",
    "loyalty_enabled",
    "customer_accounts_enabled",
    "payments_enabled",
    "ai_pdf_import_enabled",
    "ai_translate_enabled",
    "advanced_analytics_enabled",
)
# 9th flag = billing_notes (TextField, not a boolean). Not in the list
# above because it's not a feature flag — it's an operator-visible note.

# Resources that ``enforce_limit()`` knows how to count. Each maps to a
# resource-count helper in ``services._resource_count()``. Keys here MUST
# match the keys in ``PLAN_TIER_LIMITS`` for the limit lookup to succeed.
RESOURCE_FIELDS: Final = (
    "items",
    "categories",
    "branches",
    "locales",
    "monthly_views",
    "monthly_scans",
    "ai_pdf_imports",
    "ai_translate_ops",
    "ai_description_ops",
)

# Counter metrics that ``record_usage()`` increments. Each maps to a
# PositiveIntegerField on ``TenantUsageCounter``.
USAGE_METRICS: Final = (
    "views",
    "scans",
    "ai_pdf_imports",
    "ai_translate_ops",
    "ai_description_ops",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def default_features(plan: str) -> dict[str, bool]:
    """Return the default feature dict for ``plan``.

    Raises ``KeyError`` if ``plan`` is not a known tier — the caller
    should validate ``plan`` is in :data:`PLAN_TIER_ORDER` first.
    """
    return dict(PLAN_TIER_LIMITS[plan]["features"])


def is_valid_plan(plan: str) -> bool:
    """Return True iff ``plan`` is one of the 4 tier keys."""
    return plan in PLAN_TIER_LIMITS