"""The main screens of the agency panel speak Turkish all the way down: column
headers, filter titles, read-only labels and the audit trail's own words.

The live pass found "NAME", "Created at", "Is active", "Deactivated"... The model
fields have no Turkish ``verbose_name`` (giving them one would mean a migration
per field), so the admins carry the words (``TurkishLabelsMixin``)."""

from __future__ import annotations

import pytest
from django.contrib.admin.templatetags.admin_list import result_headers
from django.urls import reverse

from apps.accounts.models import Membership
from apps.audit.admin import ACTION_LABELS, TARGET_LABELS
from apps.audit.models import AuditEvent
from apps.audit.services import record_event
from apps.onboarding.provisioning import provision_tenant

pytestmark = pytest.mark.django_db

# changelist -> (column headers, filter titles)
SCREENS = {
    "organizations_organization": (
        ["İşletme", "Adres adı", "Paket", "Deneme", "Sahip", "Durum", "Sipariş (30 gün)", "Ürün", "Son sipariş"],
        ["Paket", "Durum", "Deneme", "Modül açık"],
    ),
    "billing_plansettings": (
        ["İşletme", "Paket", "Sipariş + mutfak", "Sadakat", "Deneme bitişi", "Güncellenme"],
        ["Paket", "Sepet", "Sipariş + mutfak", "Sadakat"],
    ),
    "accounts_membership": (
        ["Kullanıcı", "İşletme", "Rol", "Aktif", "Oluşturulma"],
        ["Rol", "Aktif"],
    ),
    "accounts_user": (
        ["E-posta", "Ad Soyad", "Rol", "Aktif", "Ajans paneline girer", "Süper kullanıcı"],
        ["Rol", "Aktif", "Ajans paneline girer", "Süper kullanıcı"],
    ),
    "audit_auditevent": (
        ["Zaman", "İşletme", "Kullanıcı", "Eylem", "Hedef türü", "Ayrıntı"],
        ["Eylem", "Hedef türü", "Zaman"],
    ),
    "analytics_menuviewevent": (
        ["Zaman", "İşletme", "Olay", "Dil", "Yol", "Menü"],
        ["Olay", "Dil", "Zaman"],
    ),
    "media_mediaasset": (
        ["Dosya", "İşletme", "Tür", "İçerik türü", "Boyut (KB)", "Yükleyen", "Aktif", "Yüklenme"],
        ["Tür", "Aktif"],
    ),
    "billing_tenantusagecounter": (
        ["İşletme", "Yıl", "Ay", "Görüntülenme", "Tarama", "PDF içe aktarma", "Çeviri işlemi", "Açıklama işlemi"],
        ["Yıl", "Ay"],
    ),
}

# What an unlabelled field shows as (the humanised field name).
ENGLISH = {
    "Name", "Slug", "Organization", "Role", "User", "Email", "Is active", "Is staff",
    "Is superuser", "Created at", "Updated at", "Action", "Actor", "Target type",
    "Target repr", "Event type", "Locale", "Path", "Kind", "Original filename",
    "Content type", "Uploaded by", "Period year", "Period month", "Views", "Scans",
    "Active plan", "Cart enabled", "Orders enabled", "Loyalty enabled",
}


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


def _list(client, name):
    return client.get(reverse(f"admin:{name}_changelist")).context["cl"]


def _headers(cl):
    return [str(h["text"]) for h in result_headers(cl) if "action-toggle" not in str(h["text"])]


@pytest.mark.parametrize("name", sorted(SCREENS))
def test_column_headers_and_filter_titles_are_turkish(agency, name):
    cl = _list(agency, name)
    headers, filters = SCREENS[name]
    assert _headers(cl) == headers
    assert [str(spec.title) for spec in cl.filter_specs] == filters
    assert not ENGLISH & (set(headers) | set(filters))


def test_the_audit_trail_uses_turkish_words_for_what_happened(agency, org_a):
    for action, target in (
        ("tenant_created", "organization"),
        ("deactivated", "organization"),
        ("reactivated", "organization"),
        ("plan_changed", "plan_settings"),
        ("updated", "membership"),
    ):
        record_event(
            organization=org_a, action=action, target_type=target, target_id=1, target_repr="x"
        )
    cl = _list(agency, "audit_auditevent")
    html = agency.get(reverse("admin:audit_auditevent_changelist")).content.decode()

    for word in ("Müşteri açıldı", "Askıya alındı", "Yeniden etkinleştirildi", "Paket değişti",
                 "Güncellendi", "İşletme", "Plan ayarı", "Üyelik"):
        assert word in html, word
    for english in ("Deactivated", "Reactivated", "Onboarding", "Billing:"):
        assert english not in html, english
    # The filters offer the same words.
    options = [str(c["display"]) for c in cl.filter_specs[0].choices(cl)]
    assert "Müşteri açıldı" in options
    assert any(option.startswith("Askıya alındı") for option in options)
    assert "Tenant" not in " ".join(options)


def test_every_audit_action_and_target_has_a_turkish_name():
    missing_actions = {key for key, _ in AuditEvent.ACTION_CHOICES} - set(ACTION_LABELS)
    missing_targets = {key for key, _ in AuditEvent.TARGET_CHOICES} - set(TARGET_LABELS)
    assert not missing_actions and not missing_targets, (missing_actions, missing_targets)


def test_an_unknown_action_is_shown_as_stored(agency, org_a):
    record_event(organization=org_a, action="mystery_action", target_type="menu", target_id=1, target_repr="x")
    html = agency.get(reverse("admin:audit_auditevent_changelist")).content.decode()
    assert "mystery_action" in html


def test_an_audit_record_reads_in_turkish_too(agency, org_a):
    event = record_event(
        organization=org_a, action="plan_changed", target_type="plan_settings", target_id=1,
        target_repr="PlanSettings<1/pro>", payload={"reason": "test"},
    )
    html = agency.get(reverse("admin:audit_auditevent_change", args=[event.pk])).content.decode()
    for label in ("Zaman", "Kullanıcı", "Eylem", "Hedef türü", "Ayrıntı", "IP adresi"):
        assert label in html, label
    assert "Paket değişti" in html and "Plan ayarı" in html
    for english in ("Target repr", "Target type", "Actor", "Ip address"):
        assert english not in html, english


def test_read_only_dates_have_turkish_labels(agency, org_a):
    plan = provision_tenant(name="X Kafe", slug="x-kafe", owner_email="x@x.test").plan_settings
    for url in (
        reverse("admin:organizations_organization_change", args=[org_a.pk]),
        reverse("admin:billing_plansettings_change", args=[plan.pk]),
    ):
        html = agency.get(url).content.decode()
        assert "Oluşturulma" in html and "Güncellenme" in html, url
        assert "Created at" not in html and "Updated at" not in html, url
    assert "Deneme başlangıcı" in html and "Deneme bitişi" in html
    assert "Trial started at" not in html


def test_a_membership_reads_as_who_and_in_what_role(org_a):
    member = Membership.objects.get(organization=org_a)
    assert str(member) == "owner-a@example.com — Sahip"
