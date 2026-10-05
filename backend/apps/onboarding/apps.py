"""Onboarding app config — Sprint C3 (D-030 follow-up)."""

from django.apps import AppConfig


class OnboardingConfig(AppConfig):
    name = "apps.onboarding"
    verbose_name = "Kayıt sihirbazı"
    default_auto_field = "django.db.models.BigAutoField"
