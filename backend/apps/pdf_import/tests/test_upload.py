"""Upload endpoint tests — Sprint 7A (D-021).

Covers:

* Happy-path upload with mocked AI (we patch parse_menu_pdf so the
  endpoint behaves like a real successful parse without hitting OpenAI).
* MIME type validation.
* Size cap (pre-check).
* Audit event emission (ai_import_uploaded).
* Tenant scoping — the draft's organization must match the uploader's.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditEvent
from apps.pdf_import.models import MenuImportDraft


pytestmark = pytest.mark.django_db


def _to_upload(pdf_bytes: bytes, name: str = "modern-cafe-menu.pdf") -> SimpleUploadedFile:
    return SimpleUploadedFile(
        name=name,
        content=pdf_bytes,
        content_type="application/pdf",
    )


def _mock_parse_success(parsed):
    """Patch parse_menu_pdf so the upload endpoint sees a successful parse."""

    def _fake(_pdf_path):
        return ("openai", "gpt-4o", parsed)

    return patch("apps.pdf_import.views.parse_menu_pdf", side_effect=_fake)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------
def test_upload_valid_pdf_creates_draft_parsing_status(
    authed_client, pdf_bytes, sample_openai_response
):
    with _mock_parse_success(sample_openai_response):
        response = authed_client.post(
            "/api/v1/admin/pdf-import/upload/",
            data={"file": _to_upload(pdf_bytes)},
            format="multipart",
        )
    assert response.status_code == 201, response.json()
    payload = response.json()["data"]
    assert payload["status"] == "parsed"
    assert payload["ai_provider"] == "openai"
    assert payload["ai_model"] == "gpt-4o"
    assert payload["item_count"] == 3  # 2 + 1 across categories
    assert payload["confidence_avg"] is not None

    draft = MenuImportDraft.objects.get(pk=payload["draft_id"])
    assert draft.status == "parsed"
    assert draft.organization is not None
    assert draft.created_by is not None
    assert draft.items.count() == 3


def test_upload_invalid_mime_returns_400(authed_client, pdf_bytes):
    bad = SimpleUploadedFile("menu.txt", pdf_bytes, content_type="text/plain")
    response = authed_client.post(
        "/api/v1/admin/pdf-import/upload/",
        data={"file": bad},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "pdf.invalid_mime"


def test_upload_too_large_returns_400(authed_client):
    big = b"x" * (11 * 1024 * 1024)  # 11 MB
    response = authed_client.post(
        "/api/v1/admin/pdf-import/upload/",
        data={"file": _to_upload(big, "huge.pdf")},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "pdf.too_large"


def test_upload_missing_file_returns_400(authed_client):
    response = authed_client.post(
        "/api/v1/admin/pdf-import/upload/",
        data={},
        format="multipart",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "pdf.required"


def test_upload_creates_audit_event(
    authed_client, pdf_bytes, sample_openai_response
):
    with _mock_parse_success(sample_openai_response):
        response = authed_client.post(
            "/api/v1/admin/pdf-import/upload/",
            data={"file": _to_upload(pdf_bytes)},
            format="multipart",
        )
    assert response.status_code == 201
    draft_id = response.json()["data"]["draft_id"]
    events = AuditEvent.objects.filter(action="ai_import_uploaded")
    assert events.count() == 1
    event = events.first()
    assert event.target_type == "menu_import_draft"
    assert event.target_id == draft_id


def test_upload_tenant_scoped_writes_to_uploader_org(
    api_client, pdf_bytes, sample_openai_response, org_b
):
    """Logging in as org_b's owner and uploading still writes to org_b."""
    api_client.post(
        "/api/v1/auth/login",
        data={"email": "owner-b@example.com", "password": "x"},
        format="json",
    )
    with _mock_parse_success(sample_openai_response):
        response = api_client.post(
            "/api/v1/admin/pdf-import/upload/",
            data={"file": _to_upload(pdf_bytes)},
            format="multipart",
        )
    assert response.status_code == 201
    draft = MenuImportDraft.objects.get(pk=response.json()["data"]["draft_id"])
    assert draft.organization_id == org_b.id


def test_upload_unauthenticated_returns_403(api_client, pdf_bytes):
    response = api_client.post(
        "/api/v1/admin/pdf-import/upload/",
        data={"file": _to_upload(pdf_bytes)},
        format="multipart",
    )
    # DRF returns 403 when IsAuthenticated fails (no credentials).
    assert response.status_code in (401, 403)