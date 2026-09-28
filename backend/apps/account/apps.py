"""Account app config — Sprint 10A (D-025).

Customer accounts + email magic link auth + loyalty puan ledger.
Sits next to ``apps.accounts`` (the admin/platform user app), and uses a
separate model entirely — end-customer accounts are NOT the same row as
platform users; they have no password and never log into the admin.
"""

from django.apps import AppConfig


class AccountConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.account"
    verbose_name = "Müşteri Hesabı & Sadakat Puanı"
