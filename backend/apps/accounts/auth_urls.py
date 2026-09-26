"""URL patterns for auth endpoints."""

from django.urls import path

from .auth_views import CSRFView, LoginView, LogoutView

urlpatterns = [
    path("csrf", CSRFView.as_view(), name="auth-csrf"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
]
