"""The agency's panel: Django's admin site, titled and organised for the job.

The agency (the owner and the technical team) runs customers from
``/django-admin/``. This site only changes the presentation - the title, and
the sidebar: four groups instead of one block per app, Turkish names. What
each model's page can do lives in that app's ``admin.py``.

Installed through :class:`AgencyAdminConfig` (``INSTALLED_APPS`` lists it in
place of ``django.contrib.admin``).
"""

from __future__ import annotations

from django.contrib import admin
from django.contrib.admin.apps import AdminConfig
from django.utils.text import slugify

# Sidebar groups in display order; each lists ``app_label.ModelName`` in the
# order the agency reaches for them. A group's title links to its first list.
GROUPS: list[tuple[str, list[str]]] = [
    (
        "Müşteriler",
        [
            "organizations.Organization",
            "accounts.Membership",
            "accounts.User",
            "branches.Branch",
            "menu.Menu",
            "menu.MenuCategory",
            "menu.MenuItem",
            "qr.QRCode",
            "theme.ThemeConfig",
        ],
    ),
    (
        "Siparişler",
        [
            "orders.Order",
            "account.Customer",
            "account.LoyaltySettings",
            "account.LoyaltyTransaction",
            "payment.PaymentSettings",
            "payment.OrderPayment",
            "payment.RefundRecord",
            "payment.WebhookEvent",
        ],
    ),
    (
        "Plan & Kullanım",
        [
            "billing.PlanSettings",
            "billing.TenantUsageCounter",
            "analytics.MenuViewEvent",
        ],
    ),
    (
        "Destek",
        [
            "audit.AuditEvent",
            "media.MediaAsset",
            "account.MagicLinkToken",
            "pdf_import.MenuImportDraft",
            "pdf_import.MenuImportItem",
            "translate.TranslationMemory",
            "translate.AIProductDescription",
            "menu.Allergen",
            "menu.DietaryTag",
        ],
    ),
]
OTHER_GROUP = "Diğer"


class AgencyAdminSite(admin.AdminSite):
    site_header = "QR Menü — Ajans Paneli"
    site_title = "QR Menü Ajans Paneli"
    index_title = "Müşteriler ve operasyon"
    site_url = None  # "Siteyi göster" would open the backend's empty root

    def get_app_list(self, request, app_label=None):
        app_list = super().get_app_list(request, app_label)
        if app_label is not None:  # an app's own page keeps Django's layout
            return app_list

        available = {
            f"{app['app_label']}.{model['object_name']}": model
            for app in app_list
            for model in app["models"]
        }
        groups, placed = [], set()
        for title, keys in GROUPS:
            models = [available[key] for key in keys if key in available]
            placed.update(key for key in keys if key in available)
            if models:
                groups.append(self._group(title, models))
        # A model nobody classified still shows up (and a test fails).
        rest = [model for key, model in available.items() if key not in placed]
        if rest:
            groups.append(self._group(OTHER_GROUP, rest))
        return groups

    @staticmethod
    def _group(title: str, models: list[dict]) -> dict:
        return {
            "name": title,
            "app_label": slugify(title),
            "app_url": models[0].get("admin_url") or "",
            "has_module_perms": True,
            "models": models,
        }


class AgencyAdminConfig(AdminConfig):
    default_site = "apps.core.admin_site.AgencyAdminSite"
