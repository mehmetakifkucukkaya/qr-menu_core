"""Health endpoint tests."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.django_db


def test_health_returns_ok(api_client):
    """GET /health → 200 with status: ok, database: ok."""
    response = api_client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["version"] == "1.0.0"
    assert "timestamp" in body
