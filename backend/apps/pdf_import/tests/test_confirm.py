"""Confirm endpoint + service tests — Sprint 7A (D-021).

Covers:

* Bulk save: menu + categories + items are created from the draft.
* Atomicity: a forced failure inside ``confirm_draft`` rolls back.
* Audit event (``ai_import_confirmed``).
* Wrong status → 400.
* Other-tenant draft → 404.
"""

from __future__ import annotations

import pytest
from django.db import transaction

from apps.audit.models import AuditEvent
from apps.menu.models import Menu, MenuCategory, MenuItem
from apps.pdf_import.services import confirm_draft


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Service-level: bulk save
# ---------------------------------------------------------------------------
def test_confirm_bulk_save_creates_menu_and_categories(parsed_draft, org_a):
    items_before = MenuItem.objects.filter(menu__organization=org_a).count()
    assert items_before == 0

    result = confirm_draft(
        parsed_draft,
        user=None,
        menu_name="Modern Cafe Menü",
        default_locale="tr",
        is_active=True,
    )

    assert result["category_count"] == 2
    assert result["item_count"] == 3

    menu = Menu.objects.get(pk=result["menu_id"])
    assert menu.organization_id == org_a.id
    assert menu.name == "Modern Cafe Menü"
    assert menu.is_active is True

    categories = list(MenuCategory.objects.filter(menu=menu).order_by("sort_order"))
    assert [c.name for c in categories] == ["Sıcak İçecekler", "Soğuk İçecekler"]

    items = list(MenuItem.objects.filter(menu=menu).order_by("category__sort_order", "sort_order"))
    assert len(items) == 3
    names = [i.name for i in items]
    assert "Türk Kahvesi" in names
    assert "Çay" in names
    assert "Limonata" in names

    parsed_draft.refresh_from_db()
    assert parsed_draft.status == "confirmed"
    assert parsed_draft.menu_id == menu.id


def test_confirm_atomic_rollback_on_error(parsed_draft, org_a):
    """If MenuItem.objects.create raises, the transaction rolls back."""
    original_create = MenuItem.objects.create
    call_count = {"n": 0}

    def boom(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:  # fail on second item
            raise RuntimeError("boom")
        return original_create(*args, **kwargs)

    # Patch MenuItem.objects.create so the second create raises; the
    # surrounding transaction.atomic() block should roll everything back.
    with pytest.raises(RuntimeError):
        with transaction.atomic():
            try:
                MenuItem.objects.create = boom
                confirm_draft(
                    parsed_draft,
                    user=None,
                    menu_name="X",
                )
            except Exception:
                raise
            finally:
                MenuItem.objects.create = original_create

    # Nothing should have committed.
    assert Menu.objects.filter(organization=org_a).count() == 0
    assert MenuCategory.objects.filter(menu__organization=org_a).count() == 0
    assert MenuItem.objects.filter(menu__organization=org_a).count() == 0

    parsed_draft.refresh_from_db()
    assert parsed_draft.status != "confirmed"


def test_confirm_creates_audit_event(parsed_draft, org_a):
    confirm_draft(
        parsed_draft,
        user=None,
        menu_name="M1",
    )
    events = AuditEvent.objects.filter(action="ai_import_confirmed")
    assert events.count() == 1
    event = events.first()
    assert event.organization_id == org_a.id
    assert event.target_type == "menu"
    assert event.payload["draft_id"] == parsed_draft.id


def test_confirm_wrong_status_raises(parsed_draft):
    parsed_draft.status = "pending"
    parsed_draft.save()
    with pytest.raises(ValueError):
        confirm_draft(parsed_draft, user=None, menu_name="X")


# ---------------------------------------------------------------------------
# View-level
# ---------------------------------------------------------------------------
def test_confirm_endpoint_returns_200(authed_client, parsed_draft):
    response = authed_client.post(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/confirm/",
        data={"menu_name": "Yeni Menü", "default_locale": "tr"},
        format="json",
    )
    assert response.status_code == 200, response.json()
    payload = response.json()["data"]
    assert payload["menu_id"] is not None
    assert payload["category_count"] == 2
    assert payload["item_count"] == 3

    parsed_draft.refresh_from_db()
    assert parsed_draft.status == "confirmed"
    assert parsed_draft.menu_id == payload["menu_id"]


def test_confirm_endpoint_missing_menu_name(authed_client, parsed_draft):
    response = authed_client.post(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/confirm/",
        data={},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "menu_name.required"


def test_confirm_endpoint_wrong_status(authed_client, parsed_draft):
    parsed_draft.status = "failed"
    parsed_draft.save()
    response = authed_client.post(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/confirm/",
        data={"menu_name": "X"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "draft.not_confirmable"


def test_confirm_endpoint_other_org_404(authed_client_b, parsed_draft):
    response = authed_client_b.post(
        f"/api/v1/admin/pdf-import/drafts/{parsed_draft.id}/confirm/",
        data={"menu_name": "X"},
        format="json",
    )
    assert response.status_code == 404


def test_confirm_endpoint_unknown_draft(authed_client):
    response = authed_client.post(
        "/api/v1/admin/pdf-import/drafts/99999/confirm/",
        data={"menu_name": "X"},
        format="json",
    )
    assert response.status_code == 404