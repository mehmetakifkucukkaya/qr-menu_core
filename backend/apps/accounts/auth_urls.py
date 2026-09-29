"""URL patterns for auth endpoints."""

from django.urls import path

from .auth_views import (
    CSRFView,
    LoginView,
    LogoutView,
    SignupView,
    SlugAvailabilityView,
)

urlpatterns = [
    path("csrf", CSRFView.as_view(), name="auth-csrf"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    # Sprint C1 — self-serve onboarding step 1 (slug availability check).
    path(
        "check-slug",
        SlugAvailabilityView.as_view(),
        name="auth-check-slug",
    ),
    # Sprint C1 — self-serve signup.
    path("signup", SignupView.as_view(), name="auth-signup"),
]
