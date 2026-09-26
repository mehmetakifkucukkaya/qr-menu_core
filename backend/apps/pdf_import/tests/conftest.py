"""Shared fixtures for PDF import app tests.

Reuses ``api_client`` / ``org_a`` / ``org_b`` from the root conftest, plus
a tiny in-memory PDF blob builder so tests can exercise the upload
endpoint without shipping real PDF fixtures.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Auth helper — same shape used across the rest of the test suite.
# ---------------------------------------------------------------------------
def _login(client, email, password="x") -> None:
    client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


@pytest.fixture
def authed_client(api_client: APIClient, org_a) -> APIClient:
    """api_client already logged in as org_a's owner.

    Depends on ``org_a`` so the user fixture in the root conftest runs first
    (the root fixture lazily creates the owner user).
    """
    _login(api_client, "owner-a@example.com")
    return api_client


@pytest.fixture
def authed_client_b(api_client: APIClient, org_b) -> APIClient:
    """api_client already logged in as org_b's owner."""
    _login(api_client, "owner-b@example.com")
    return api_client


# ---------------------------------------------------------------------------
# Minimal valid PDF (1-page, 1 KB) — enough for size checks; the AI is
# mocked in test_parsing.py so the actual content never matters.
# ---------------------------------------------------------------------------
PDF_MAGIC = b"%PDF-1.4\n"
PDF_FILLER = b"% " + (b"x" * 1000) + b"\n"
PDF_EOF = b"%%EOF\n"


@pytest.fixture
def pdf_bytes() -> bytes:
    """Return a tiny, syntactically valid PDF blob."""
    return PDF_MAGIC + PDF_FILLER + PDF_EOF


# ---------------------------------------------------------------------------
# Pre-baked AI responses — used by mocked parsing tests.
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_openai_response() -> dict:
    """A realistic OpenAI json_schema response."""
    return {
        "categories": [
            {
                "name": "Sıcak İçecekler",
                "items": [
                    {
                        "name": "Türk Kahvesi",
                        "description": "Geleneksel fincan usulü.",
                        "price": 45.0,
                        "currency": "TRY",
                        "allergens": ["caffeine"],
                        "dietary_tags": ["popular"],
                        "raw_text": "Türk Kahvesi — 45 TL",
                        "confidence": 0.95,
                    },
                    {
                        "name": "Çay",
                        "description": "Demli ince belli.",
                        "price": 15.0,
                        "currency": "TRY",
                        "allergens": [],
                        "dietary_tags": [],
                        "raw_text": "Çay — 15 TL",
                        "confidence": 0.99,
                    },
                ],
            },
            {
                "name": "Soğuk İçecekler",
                "items": [
                    {
                        "name": "Limonata",
                        "description": "Taze sıkım.",
                        "price": 65.0,
                        "currency": "TRY",
                        "allergens": [],
                        "dietary_tags": ["vegan"],
                        "raw_text": "Limonata — 65 TL",
                        "confidence": 0.88,
                    },
                ],
            },
        ]
    }


@pytest.fixture
def parsed_draft(org_a):
    """A draft already in ``parsed`` state with 3 items + 2 categories."""
    from decimal import Decimal

    from apps.pdf_import.models import MenuImportDraft, MenuImportItem

    draft = MenuImportDraft.objects.create(
        organization=org_a,
        status="parsed",
        ai_provider="openai",
        ai_model="gpt-4o",
        raw_pdf_filename="modern-cafe-menu.pdf",
        raw_pdf_size_bytes=2048,
        confidence_avg=Decimal("0.93"),
        parsed_data={
            "categories": [
                {"name": "Sıcak İçecekler", "items": []},
                {"name": "Soğuk İçecekler", "items": []},
            ]
        },
    )
    MenuImportItem.objects.create(
        draft=draft, sort_order=0,
        category_name="Sıcak İçecekler",
        name="Türk Kahvesi", price=Decimal("45.00"), currency="TRY",
        confidence=Decimal("0.95"),
    )
    MenuImportItem.objects.create(
        draft=draft, sort_order=1,
        category_name="Sıcak İçecekler",
        name="Çay", price=Decimal("15.00"), currency="TRY",
        confidence=Decimal("0.99"),
    )
    MenuImportItem.objects.create(
        draft=draft, sort_order=0,
        category_name="Soğuk İçecekler",
        name="Limonata", price=Decimal("65.00"), currency="TRY",
        confidence=Decimal("0.88"),
    )
    return draft