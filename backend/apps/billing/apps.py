"""Billing app config — Sprint B1 (D-026)."""

from django.apps import AppConfig


class BillingConfig(AppConfig):
    """Plan + Feature Flags + Limits — Sprint B1."""

    name = "apps.billing"
    verbose_name = "Plan ve Limitler"
    default_auto_field = "django.db.models.BigAutoField"