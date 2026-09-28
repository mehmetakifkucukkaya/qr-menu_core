"""View tests for the AI translate / describe endpoints — Sprint 9A.

Five happy paths + per-endpoint error coverage + audit emission:

* POST /api/v1/admin/translate/                       — happy
* POST /api/v1/admin/translate/menu-item/<pk>/        — happy
* POST /api/v1/admin/translate/menu-category/<pk>/    — happy
* POST /api/v1/admin/describe/menu-item/<pk>/         — happy
* POST /api/v1/admin/describe/bulk/                   — happy

Error paths (one per endpoint) cover the cross-tenant 404, validation
400, and provider-failure 502. Tenant isolation + audit emission
live in ``test_security.py``.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest

from apps.audit.models import AuditEvent
from apps.translate.models import AIProductDescription, TranslationMemory

from .conftest import (
    _build_fake_anthropic,
    _build_fake_openai,
    _stub_settings,
    patch_get_anthropic,
    patch_get_openai,
    patch_settings,
)
from .factories import make_category, make_item, make_menu


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _seed_item_for_translate(org):
    menu = make_menu(org, name=f"Menu-{org.slug}")
    category = make_category(menu, name="Sıcak İçecekler")
    item = make_item(
        category=category,
        menu=menu,
        name="Türk Kahvesi",
        description="Geleneksel",
        price=Decimal("45.00"),
    )
    return item, category


# ---------------------------------------------------------------------------
# 1) POST /api/v1/admin/translate/  — happy + audit
# ---------------------------------------------------------------------------
def test_translate_text_endpoint_happy(
    authed_client, org_a, sample_translation_response
):
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            "/api/v1/admin/translate/",
            data={
                "text": "Türk Kahvesi",
                "source_locale": "tr",
                "target_locale": "en",
            },
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["translated"] == "Turkish Coffee"
    assert payload["provider"] == "openai"
    assert payload["cached"] is False
    assert payload["source_locale"] == "tr"
    assert payload["target_locale"] == "en"

    # Audit event for the cache row.
    events = AuditEvent.objects.filter(action="ai_translation_generated")
    assert events.count() == 1
    event = events.first()
    assert event.target_type == "translation_memory"
    assert event.organization_id == org_a.id


def test_translate_text_endpoint_validation_error(authed_client):
    response = authed_client.post(
        "/api/v1/admin/translate/",
        data={"text": "Türk Kahvesi", "source_locale": "tr",
              "target_locale": "tr"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "translate.invalid_payload"


def test_translate_text_endpoint_provider_failure(authed_client):
    broken = _build_fake_openai({"translated": "x"})
    broken.OpenAI.return_value.chat.completions.create.side_effect = (
        RuntimeError("provider down")
    )

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(broken),
    ):
        response = authed_client.post(
            "/api/v1/admin/translate/",
            data={
                "text": "Türk Kahvesi",
                "source_locale": "tr",
                "target_locale": "en",
            },
            format="json",
        )
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "ai.provider_unavailable"


# ---------------------------------------------------------------------------
# 2) POST /api/v1/admin/translate/menu-item/<pk>/  — happy + audit
# ---------------------------------------------------------------------------
def test_translate_menu_item_endpoint_happy(
    authed_client, org_a, sample_translation_response
):
    item, _ = _seed_item_for_translate(org_a)
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            f"/api/v1/admin/translate/menu-item/{item.id}/",
            data={"source_locale": "tr", "target_locales": ["en"]},
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["item_id"] == item.id
    assert len(payload["translations"]) == 1
    locales = {t["locale"] for t in payload["translations"]}
    assert locales == {"en"}

    # Both name + description translations get cached.
    assert TranslationMemory.objects.filter(organization=org_a).count() == 2

    events = AuditEvent.objects.filter(action="ai_translation_generated")
    # 2 cache-level audits (translation_memory) + 1 menu_item audit.
    assert events.count() == 3
    event = events.filter(target_type="menu_item").first()
    assert event is not None
    assert event.organization_id == org_a.id
    assert event.payload["kind"] == "menu_item"


def test_translate_menu_item_endpoint_404_unknown(authed_client):
    response = authed_client.post(
        "/api/v1/admin/translate/menu-item/99999/",
        data={"source_locale": "tr", "target_locales": ["en"]},
        format="json",
    )
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "translate.item_not_found"


# ---------------------------------------------------------------------------
# 3) POST /api/v1/admin/translate/menu-category/<pk>/  — happy + audit
# ---------------------------------------------------------------------------
def test_translate_menu_category_endpoint_happy(
    authed_client, org_a, sample_translation_response
):
    _, category = _seed_item_for_translate(org_a)
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            f"/api/v1/admin/translate/menu-category/{category.id}/",
            data={"source_locale": "tr", "target_locales": ["en"]},
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["category_id"] == category.id
    assert len(payload["translations"]) == 1
    assert payload["translations"][0]["locale"] == "en"

    events = AuditEvent.objects.filter(action="ai_translation_generated")
    cat_event = events.filter(target_type="menu_category").first()
    assert cat_event is not None
    assert cat_event.organization_id == org_a.id


def test_translate_menu_category_endpoint_404_unknown(authed_client):
    response = authed_client.post(
        "/api/v1/admin/translate/menu-category/99999/",
        data={"source_locale": "tr", "target_locales": ["en"]},
        format="json",
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 4) POST /api/v1/admin/describe/menu-item/<pk>/  — happy + audit
# ---------------------------------------------------------------------------
def test_describe_menu_item_endpoint_happy(
    authed_client, org_a, sample_description_response
):
    item, _ = _seed_item_for_translate(org_a)
    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            f"/api/v1/admin/describe/menu-item/{item.id}/",
            data={"locale": "tr"},
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["item_id"] == item.id
    assert payload["locale"] == "tr"
    assert payload["regenerated"] is True
    assert payload["provider"] == "openai"

    row = AIProductDescription.objects.get(menu_item=item, locale="tr")
    assert row.is_edited is False

    events = AuditEvent.objects.filter(action="ai_description_generated")
    assert events.count() == 1
    event = events.first()
    assert event.target_id == item.id
    assert event.organization_id == org_a.id
    assert event.payload["locale"] == "tr"


def test_describe_menu_item_endpoint_404_unknown(authed_client):
    response = authed_client.post(
        "/api/v1/admin/describe/menu-item/99999/",
        data={"locale": "tr"},
        format="json",
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# 5) POST /api/v1/admin/describe/bulk/  — happy + audit
# ---------------------------------------------------------------------------
def test_describe_bulk_endpoint_happy(
    authed_client, org_a, sample_description_response
):
    items = []
    for i in range(3):
        item, _ = _seed_item_for_translate(org_a)
        item.name = f"Item {i}"
        item.save()
        items.append(item)

    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            "/api/v1/admin/describe/bulk/",
            data={"locale": "tr"},
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["locale"] == "tr"
    assert payload["total_generated"] == 3
    assert payload["total_skipped"] == 0
    assert len(payload["results"]) == 3

    # Each successful generation gets its own audit event.
    events = AuditEvent.objects.filter(action="ai_description_generated")
    assert events.count() == 3
    for event in events:
        assert event.organization_id == org_a.id
        assert event.payload["kind"] == "bulk"


def test_bulk_endpoint_respects_item_ids_filter(
    authed_client, org_a, sample_description_response
):
    items = []
    for i in range(3):
        item, _ = _seed_item_for_translate(org_a)
        item.name = f"Item {i}"
        item.save()
        items.append(item)

    fake_openai = _build_fake_openai(sample_description_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            "/api/v1/admin/describe/bulk/",
            data={"locale": "tr", "item_ids": [items[0].id]},
            format="json",
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["filter"]["total_requested"] == 1
    assert payload["filter"]["item_ids"] == [items[0].id]
    assert len(payload["results"]) == 1


# ---------------------------------------------------------------------------
# Audit metadata
# ---------------------------------------------------------------------------
def test_endpoints_emit_audit_event_with_provider_metadata(
    authed_client, org_a, sample_translation_response
):
    item, _ = _seed_item_for_translate(org_a)
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        response = authed_client.post(
            "/api/v1/admin/translate/",
            data={
                "text": "Türk Kahvesi",
                "source_locale": "tr",
                "target_locale": "en",
            },
            format="json",
        )

    assert response.status_code == 200
    events = AuditEvent.objects.filter(action="ai_translation_generated")
    assert events.count() == 1
    event = events.first()
    assert event.payload["ai_provider"] == "openai"
    assert event.payload["ai_model"] == "gpt-4o"
    assert event.payload["cached"] is False
    assert "source_text_hash" in event.payload
