"""Onboarding URL patterns — Sprint C3.

Mounted by ``config.urls`` under ``/api/v1/onboarding/`` and
``/api/v1/qr-codes/``:

    POST /api/v1/onboarding/complete/        → materialize wizard step 3-4
    POST /api/v1/onboarding/demo-seed/       → Modern Cafe template import
    POST /api/v1/qr-codes/first/             → wizard step 5 first QR
    GET  /api/v1/onboarding/trial-status/    → TrialBanner feed
"""

from django.urls import path

from .views import (
    DemoSeedView,
    FirstQRView,
    OnboardingCompleteView,
    TrialStatusView,
)

app_name = "onboarding"

urlpatterns = [
    path(
        "complete",
        OnboardingCompleteView.as_view(),
        name="onboarding-complete",
    ),
    path(
        "demo-seed",
        DemoSeedView.as_view(),
        name="onboarding-demo-seed",
    ),
    path(
        "trial-status",
        TrialStatusView.as_view(),
        name="onboarding-trial-status",
    ),
    # QR-Codes mount (different prefix — bundled here for cohesion since
    # the wizard's first-QR is part of the onboarding flow).
    path(
        "first",
        FirstQRView.as_view(),
        name="qr-first",
    ),
]
