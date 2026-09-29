"""Onboarding app config — Sprint C3 (D-030 follow-up)."""

from django.apps import AppConfig


class OnboardingConfig(AppConfig):
    name = "apps.onboarding"
    verbose_name = "Onboarding Wizard"
    default_auto_field = "django.db.models.BigAutoField"
