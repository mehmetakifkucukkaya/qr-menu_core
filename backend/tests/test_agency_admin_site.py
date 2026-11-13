"""The agency's panel is Django's admin, made Turkish and organised for the job
(SPEC_PILOT_READINESS 4.3): one title, four groups, Turkish names, nothing in
English left in the sidebar and nothing unclassified."""

from __future__ import annotations

import pytest
from django.apps import apps
from django.contrib import admin
from django.contrib.auth.models import Group
from django.urls import reverse

pytestmark = pytest.mark.django_db

GROUPS = ["Müşteriler", "Siparişler", "Plan & Kullanım", "Destek"]

# The models whose names were English (or missing: "Payment settingss").
RENAMED = {
    "audit.AuditEvent": ("Denetim olayı", "Denetim olayları"),
    "account.Customer": ("Müşteri hesabı", "Müşteri hesapları"),  # "Müşteriler" is the agency's own group
    "account.MagicLinkToken": ("Giriş bağlantısı", "Giriş bağlantıları"),
    "translate.TranslationMemory": ("Çeviri belleği", "Çeviri belleği kayıtları"),
    "translate.AIProductDescription": (
        "Yapay zekâ ürün açıklaması",
        "Yapay zekâ ürün açıklamaları",
    ),
    "pdf_import.MenuImportDraft": ("PDF menü taslağı", "PDF menü taslakları"),
    "pdf_import.MenuImportItem": ("PDF menü satırı", "PDF menü satırları"),
    "payment.PaymentSettings": ("Ödeme ayarı", "Ödeme ayarları"),
    "payment.OrderPayment": ("Sipariş ödemesi", "Sipariş ödemeleri"),
    "payment.RefundRecord": ("İade kaydı", "İade kayıtları"),
    "payment.WebhookEvent": ("Ödeme bildirimi", "Ödeme bildirimleri"),
}

# What the breadcrumbs call each app.
APP_LABELS = {
    "accounts": "Hesaplar",
    "analytics": "Analitik",
    "audit": "Denetim",
    "branches": "Şubeler",
    "core": "Çekirdek",
    "health": "Sağlık",
    "media": "Medya",
    "menu": "Menü",
    "onboarding": "Kayıt sihirbazı",
    "organizations": "İşletmeler",
    "pdf_import": "PDF menü içe aktarma",
    "qr": "QR kodlar",
    "theme": "Tema",
    "translate": "Çeviri ve açıklama",
}


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


def test_the_panel_has_its_own_title_and_four_groups(agency):
    response = agency.get(reverse("admin:index"))

    assert response.status_code == 200
    assert "QR Menü — Ajans Paneli" in response.content.decode()
    assert [app["name"] for app in response.context["app_list"]] == GROUPS


def test_every_registered_model_sits_in_exactly_one_group(agency):
    """A model added later without a place fails here (it would land in "Diğer")."""
    listed = [
        model["object_name"]
        for app in agency.get(reverse("admin:index")).context["app_list"]
        for model in app["models"]
    ]
    assert len(listed) == len(set(listed))
    assert set(listed) == {model.__name__ for model in admin.site._registry}


def test_the_groups_are_ordered_by_what_the_agency_does(agency):
    groups = {a["name"]: a for a in agency.get(reverse("admin:index")).context["app_list"]}
    names = {g: [m["name"] for m in groups[g]["models"]] for g in groups}
    assert names["Müşteriler"][0] == "İşletmeler"
    assert "Siparişler" in names["Siparişler"]
    assert names["Plan & Kullanım"][0] == "Plan Ayarları"
    assert "Alerjenler" in names["Destek"]
    # A group's title links to its first list.
    assert groups["Müşteriler"]["app_url"] == reverse("admin:organizations_organization_changelist")


@pytest.mark.parametrize("label", sorted(RENAMED))
def test_no_model_name_is_left_in_english(label):
    meta = apps.get_model(label)._meta
    assert (meta.verbose_name, meta.verbose_name_plural) == RENAMED[label]


@pytest.mark.parametrize("app_label", sorted(APP_LABELS))
def test_breadcrumb_app_names_are_turkish(app_label):
    assert apps.get_app_config(app_label).verbose_name == APP_LABELS[app_label]


def test_the_unused_django_groups_are_not_offered():
    assert Group not in admin.site._registry


def test_every_list_page_still_opens(agency, org_a):
    failed = []
    for model in admin.site._registry:
        opts = model._meta
        response = agency.get(reverse(f"admin:{opts.app_label}_{opts.model_name}_changelist"))
        if response.status_code != 200:
            failed.append((opts.label, response.status_code))
    assert failed == []


def test_an_apps_own_page_keeps_djangos_layout(agency):
    response = agency.get(reverse("admin:app_list", args=["organizations"]))
    assert response.status_code == 200
    assert [a["app_label"] for a in response.context["app_list"]] == ["organizations"]


def test_anonymous_visitors_are_sent_to_the_login(client):
    response = client.get(reverse("admin:index"))
    assert response.status_code == 302
    assert response["Location"].startswith("/django-admin/login/")


def test_a_business_owner_cannot_enter_the_agency_panel(client, org_a):
    client.force_login(org_a.memberships.get().user)
    response = client.get(reverse("admin:index"))
    assert response.status_code == 302
    assert response["Location"].startswith("/django-admin/login/")
