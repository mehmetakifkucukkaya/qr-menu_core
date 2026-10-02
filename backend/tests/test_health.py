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


def test_health_returns_503_when_database_is_down(api_client, monkeypatch):
    """A dead DB must not report healthy (ANALYSIS_1 F-03d).

    Docker's `curl -f` healthcheck and external uptime monitors only notice a
    failure if the status code says so; the endpoint used to answer 200 with
    `status: degraded` in the body, so an outage looked like a healthy service.
    """
    from django.db import connections
    from django.db.utils import OperationalError

    def broken_cursor(*args, **kwargs):
        raise OperationalError("connection refused")

    monkeypatch.setattr(connections["default"], "cursor", broken_cursor)

    response = api_client.get("/health")

    assert response.status_code == 503
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "error"
