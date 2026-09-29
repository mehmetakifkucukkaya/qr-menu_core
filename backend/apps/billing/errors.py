"""Billing errors — Sprint B1 (D-026).

Two custom exceptions surfaced by ``services`` and translated to HTTP
by ``views``:

* :class:`LimitExceeded` — ``enforce_limit()`` rejection. HTTP 402.
  Carries the resource name + current count + tier limit so the admin
  UI can render the "you're at 25/25 items, upgrade to Pro for 100"
  copy.

* :class:`FeatureDisabled` — ``has_feature()`` rejection when called
  from a guard decorator. HTTP 403. Carries the feature name so the
  client can decide whether to surface an "Upgrade" CTA.
"""

from __future__ import annotations


class BillingError(Exception):
    """Base class — keeps the catch-block in views simple."""

    code = "billing.error"
    http_status = 400

    def __init__(self, message: str = "", **extra):
        super().__init__(message)
        self.message = message
        self.extra = extra

    def to_payload(self) -> dict:
        """Build the DRF response body shape."""
        return {
            "code": self.code,
            "message": self.message,
            **self.extra,
        }


class LimitExceeded(BillingError):
    """Tenant is at (or above) its tier limit for a resource.

    Maps to HTTP 402 (Payment Required) — V1 choice that lets the
    front-end distinguish "you ran out" (402) from "you sent bad
    data" (400) without checking the response code's last digit.
    """

    code = "billing.limit_exceeded"
    http_status = 402


class FeatureDisabled(BillingError):
    """The feature flag is False on the tenant's PlanSettings.

    Maps to HTTP 403. The client can show the "Plan'ınız bu özelliği
    içermiyor, yükseltmek için /admin/billing" CTA.
    """

    code = "billing.feature_disabled"
    http_status = 403