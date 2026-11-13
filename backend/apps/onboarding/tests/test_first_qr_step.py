"""Step 5 of the signup wizard: ``POST /api/v1/qr-codes/first``.

The view built its reply from ``qr.slug``, but a QR code has no slug, so the
last step of the wizard crashed with an ``AttributeError`` (HTTP 500) for every
new business.
"""

from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from apps.qr.models import QRCode

pytestmark = pytest.mark.django_db


def _signup(client):
    return client.post(
        "/api/v1/auth/signup",
        {
            "email": "new-owner@mycafe.example",
            "password": "S3cur3-Pass!",
            "full_name": "Cafe Owner",
            "business_name": "My Cafe",
            "slug": "my-cafe",
            "default_locale": "tr",
            "supported_locales": ["tr", "en"],
            "currency": "TRY",
        },
        format="json",
    )


def test_the_wizards_last_step_returns_the_first_qr():
    """Step 5 used to crash: the view read ``qr.slug``, QR codes have no slug."""
    client = APIClient()
    assert _signup(client).status_code == 201
    done = client.post(
        "/api/v1/onboarding/complete", {"category_name": "Kahve", "skip_items": True}, format="json"
    )
    assert done.status_code == 201, done.content

    response = client.post("/api/v1/qr-codes/first", {}, format="json")

    assert response.status_code == 201, response.content
    data = response.json()["data"]
    assert data["slug"] == "my-cafe"
    assert data["target_url"].endswith("/m/my-cafe")
    assert data["id"] == QRCode.objects.get(organization__slug="my-cafe").id
