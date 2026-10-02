"""Throttle helpers shared by the public read endpoints (ANALYSIS_1 F-05).

The Next.js server renders every public page by calling Django server-side.
All of those calls come from the Next container's single IP and do not carry
the visitor's address, so a plain per-IP ``AnonRateThrottle`` counts *every
visitor of every business together* and the 61st page view in a minute is an
error page.

The Next server therefore proves who it is with a shared secret
(``INTERNAL_API_TOKEN``, sent as ``X-Internal-Token``) and is exempt from the
throttles that guard **read** endpoints. Browsers and every write endpoint
(orders, magic link, signup, analytics events) keep their per-client limits.
The secret exists only in the two server environments; it is never sent to a
browser.
"""

from __future__ import annotations

import hmac

from django.conf import settings
from rest_framework.throttling import AnonRateThrottle

INTERNAL_TOKEN_HEADER = "HTTP_X_INTERNAL_TOKEN"


def is_trusted_internal_request(request) -> bool:
    """True when the request carries the configured ``INTERNAL_API_TOKEN``.

    An unset (empty) server token never matches, even against an empty header.
    """
    expected = getattr(settings, "INTERNAL_API_TOKEN", "") or ""
    if not expected:
        return False
    supplied = request.META.get(INTERNAL_TOKEN_HEADER, "") or ""
    if not supplied:
        return False
    return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))


class InternalExemptAnonRateThrottle(AnonRateThrottle):
    """``AnonRateThrottle`` that lets the trusted SSR caller through."""

    def allow_request(self, request, view):
        if is_trusted_internal_request(request):
            return True
        return super().allow_request(request, view)
