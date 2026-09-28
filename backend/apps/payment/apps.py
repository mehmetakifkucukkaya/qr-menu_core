from django.apps import AppConfig


class PaymentConfig(AppConfig):
    """Online payment (Stripe primary, iyzico adapter) — Sprint 11A, D-026."""

    name = "apps.payment"
    verbose_name = "Online Ödeme"
    default_auto_field = "django.db.models.BigAutoField"
