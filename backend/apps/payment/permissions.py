"""Payment app permissions — ANALYSIS_1 F-06."""

from __future__ import annotations

from django.conf import settings
from rest_framework.exceptions import NotFound
from rest_framework.permissions import BasePermission


class PaymentsFeatureEnabled(BasePermission):
    """Platform-wide kill switch for the whole payment API.

    ``settings.PAYMENTS_ENABLED`` (env ``PAYMENTS_ENABLED``, default OFF) keeps the
    module dark until the checkout has a payment step. While it is off every
    payment route - public pay / status, the Stripe webhook and all admin
    endpoints - answers 404 ``payment.disabled`` to everybody (even anonymous
    callers, before any 401/403), so the surface is effectively not there.

    List it FIRST in ``permission_classes``.
    """

    def has_permission(self, request, view) -> bool:
        if not getattr(settings, "PAYMENTS_ENABLED", False):
            raise NotFound(
                detail={
                    "detail": "Çevrim içi ödeme bu kurulumda kapalı.",
                    "code": "payment.disabled",
                }
            )
        return True
