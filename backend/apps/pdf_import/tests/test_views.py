"""View-level tests for drafts list/detail, item edit, and discard — Sprint 7A."""

from __future__ import annotations

import pytest

from apps.audit.models import AuditEvent
from apps.pdf_import.models import MenuImportDraft


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Drafts list
# ---------------------------------------------------------------------------
def test_drafts_list_tenant_scoped(api_client, parsed_draft, org_b):
    """org_b's owner doesn't see org_a's drafts (and vice-versa)."""
    # Seed a draft under org_b so the list isn't empty.
    b_draft = MenuImportDraft.objects.create(
        organization=org_b,
        status="parsed",
        raw_pdf_filename="b-menu.pdf",
        raw_pdf_size_bytes=10,
    )

    # Login as org_a and check: parsed_draft in list, b_draft not.
    api_client.post(
        "/api/v1/auth/login",
        data={"email": "owner-a@example.com", "password": "x"},
        format="json",
    )
    response = api_client.get("/api/v1/admin/pdf-import/drafts/")
    assert response.status_code == 200
    ids = [d["id"] for d in response.json()["data"]]
    assert parsed_draft.id in ids
    assert b_draft.id not in ids

    # Switch to org_b and check: b_draft in list, parsed_draft not.
    api_client.post(
        "/api/v1/auth/login",
        data={"email": "owner-b@example.com", "password": "x"},
        format="json",
    )
    response_b = api_client.get("/api/v1/admin/pdf-import/drafts/")
    assert response_b.status_code == 200
    ids_b = [d["id"] for d in response_b.json()["data"]]
    assert parsed_draft.id not in ids_b
    assert b_draft.id in ids_b


def test_drafts_list_includes_item_count(authed_client, parsed_draft):
    response = authed_client.get("/api/v1/admin/pdf-import/drafts/")
    assert response.status_code == 200
    payload = response.json()["data"]
    matching = [d for d in payload if d["id"] == parsed_draft.id]
    assert matching
    assert matching[0]["item_count"] == 3


def test_drafts_list_ordered_newest_first(authed_client, parsed_draft):
    newer = MenuImportDraft.objects.create(
        organization=parsed_draft.organization,
        status="parsed",
        raw_pdf_filename="newer.pdf",
        raw_pdf_size_bytes=10,
    )
    response = authed_client.get("/api/v1/admin/pdf-import/drafts/")
    ids = [d["id"] for d in response.json()["data"]]
    # Order: newest first (auto_now). The fixture created parsed_draft
    # earlier than the in-test ``newer`` draft, so newer is at index 0.
    assert ids[0] == newer.id
    assert ids[1] == parsed_draft.id


# ---------------------------------------------------------------------------
# Draft detail
# ---------------------------------------------------------------------------
def test_draft_detail_returns_items(authed_client, parsed_draft):
    response = authed_client.get(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/"
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == parsed_draft.id
    assert data["status"] == "parsed"
    assert len(data["items"]) == 3

    item = data["items"][0]
    assert "name" in item
    assert "category_name" in item
    assert "confidence" in item
    assert "is_edited" in item


def test_draft_detail_404_other_org(authed_client_b, parsed_draft):
    response = authed_client_b.get(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/"
    )
    assert response.status_code == 404


def test_draft_detail_404_unknown(authed_client):
    response = authed_client.get("/api/v1/admin/pdf-import/drafts/99999/")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Item edit
# ---------------------------------------------------------------------------
def test_item_update_marks_edited(authed_client, parsed_draft):
    item = parsed_draft.items.first()
    response = authed_client.patch(
        f"/api/v1/admin/pdf-import/items/{item.id}/",
        data={"name": "Türk Kahvesi (yeni)"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    item.refresh_from_db()
    assert item.is_edited is True
    assert item.name == "Türk Kahvesi (yeni)"


def test_item_update_unknown_field_returns_400(authed_client, parsed_draft):
    item = parsed_draft.items.first()
    response = authed_client.patch(
        f"/api/v1/admin/pdf-import/items/{item.id}/",
        data={"id": 9999},  # not editable
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "item.unknown_field"


def test_item_update_wrong_status_returns_400(authed_client, parsed_draft):
    parsed_draft.status = "pending"
    parsed_draft.save()
    item = parsed_draft.items.first()
    response = authed_client.patch(
        f"/api/v1/admin/pdf-import/items/{item.id}/",
        data={"name": "x"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "item.not_editable"


def test_item_update_other_org_returns_404(authed_client_b, parsed_draft):
    item = parsed_draft.items.first()
    response = authed_client_b.patch(
        f"/api/v1/admin/pdf-import/items/{item.id}/",
        data={"name": "x"},
        format="json",
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Discard
# ---------------------------------------------------------------------------
def test_discard_marks_status(authed_client, parsed_draft):
    response = authed_client.delete(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/discard/"
    )
    assert response.status_code == 204
    parsed_draft.refresh_from_db()
    assert parsed_draft.status == "discarded"


def test_discard_creates_audit_event(authed_client, parsed_draft):
    response = authed_client.delete(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/discard/"
    )
    assert response.status_code == 204
    events = AuditEvent.objects.filter(action="ai_import_discarded")
    assert events.count() == 1
    event = events.first()
    assert event.target_id == parsed_draft.id
    assert event.payload["status_before"] == "parsed"


def test_discard_wrong_status_returns_400(authed_client, parsed_draft):
    parsed_draft.status = "confirmed"
    parsed_draft.save()
    response = authed_client.delete(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/discard/"
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "draft.not_discardable"


def test_discard_other_org_returns_404(authed_client_b, parsed_draft):
    response = authed_client_b.delete(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/discard/"
    )
    assert response.status_code == 404