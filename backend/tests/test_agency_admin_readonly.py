"""The audit trail, uploaded media and menu-view events are the agency's
evidence, not its workbench: viewable, searchable, never editable
(SPEC_PILOT_READINESS 4.3)."""

from __future__ import annotations

import pytest
from django.contrib import admin
from django.urls import reverse

from apps.analytics.models import MenuViewEvent
from apps.audit.models import AuditEvent
from apps.audit.services import record_event
from apps.media.models import MediaAsset

pytestmark = pytest.mark.django_db


@pytest.fixture
def agency(client, admin_user):
    client.force_login(admin_user)
    return client


@pytest.fixture
def rows(org_a):
    event = record_event(
        organization=org_a, action="plan_changed", target_type="plan_settings",
        target_id=1, target_repr="PlanSettings<1/pro>", payload={"reason": "test"},
    )
    asset = MediaAsset.objects.create(
        organization=org_a, kind="image", original_filename="latte.jpg",
        content_type="image/jpeg", size_bytes=2048, storage_key="tenants/cafe-a/latte.jpg",
        public_url="http://localhost:3000/media/latte.jpg",
    )
    view = MenuViewEvent.objects.create(
        organization=org_a, event_type="menu_view", locale="tr", path="/m/cafe-a",
        user_agent_hash="a" * 64, ip_hash="b" * 64,
    )
    return {AuditEvent: event, MediaAsset: asset, MenuViewEvent: view}


@pytest.mark.parametrize("model", [AuditEvent, MediaAsset, MenuViewEvent])
def test_the_records_can_be_looked_at(agency, rows, model):
    opts = model._meta
    listing = agency.get(reverse(f"admin:{opts.app_label}_{opts.model_name}_changelist"))
    assert listing.status_code == 200
    detail = agency.get(
        reverse(f"admin:{opts.app_label}_{opts.model_name}_change", args=[rows[model].pk])
    )
    assert detail.status_code == 200


@pytest.mark.parametrize("model", [AuditEvent, MediaAsset, MenuViewEvent])
def test_the_records_cannot_be_added_changed_or_deleted(agency, rows, model):
    opts = model._meta
    prefix = f"admin:{opts.app_label}_{opts.model_name}"
    pk = rows[model].pk
    assert agency.get(reverse(f"{prefix}_add")).status_code == 403
    assert agency.post(reverse(f"{prefix}_change", args=[pk]), {}).status_code == 403
    assert agency.get(reverse(f"{prefix}_delete", args=[pk])).status_code == 403
    assert agency.post(reverse(f"{prefix}_delete", args=[pk]), {"post": "yes"}).status_code == 403
    assert model.objects.filter(pk=pk).exists()


@pytest.mark.parametrize("model", [AuditEvent, MediaAsset, MenuViewEvent])
def test_bulk_delete_is_not_offered(agency, rows, model, rf, admin_user):
    request = rf.get("/")
    request.user = admin_user
    assert dict(admin.site._registry[model].get_actions(request)) == {}


def test_the_audit_list_shows_whose_event_it_was_even_after_the_business_is_gone(agency, org_a):
    org_a.delete()
    listing = agency.get(reverse("admin:audit_auditevent_changelist"))
    assert listing.status_code == 200
    assert "Cafe A (cafe-a)" in listing.content.decode()


def test_the_audit_list_is_searchable_by_business_and_filterable_by_action(agency, org_a, org_b, rows):
    record_event(
        organization=org_b, action="deactivated", target_type="organization",
        target_id=org_b.id, target_repr="Cafe B (cafe-b)",
    )
    url = reverse("admin:audit_auditevent_changelist")

    found = agency.get(url, {"q": "cafe-b"}).context["cl"].result_list
    assert found and all(e.organization_label == "Cafe B (cafe-b)" for e in found)

    only = agency.get(url, {"action__exact": "plan_changed"}).context["cl"].result_list
    assert [e.action for e in only] == ["plan_changed"]


def test_they_sit_in_the_right_sidebar_groups(agency):
    groups = {a["name"]: [m["name"] for m in a["models"]] for a in agency.get(reverse("admin:index")).context["app_list"]}
    assert "Denetim olayları" in groups["Destek"]
    assert "Medya Varlıkları" in groups["Destek"]
    assert "Menü Görüntülenme Olayları" in groups["Plan & Kullanım"]
