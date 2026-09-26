"""URL patterns for accounts app — /api/v1/me."""

from django.urls import path

from .auth_views import MeView

urlpatterns = [
    path("me", MeView.as_view(), name="auth-me"),
]
