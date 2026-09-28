"""Shared fixtures for AI translate / describe app tests — Sprint 9A.

Reuses ``api_client`` / ``org_a`` / ``org_b`` / ``menu`` / ``category`` /
``item`` from the root + menu conftest, and adds AI-mocking helpers
that other test files can pull in with a single import.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clear_throttle_cache():
    """Reset DRF's cache between tests.

    Mirrors the autouse fixture in ``apps/menu/tests/conftest.py`` —
    tests in ``tests/test_organization_isolation.py`` and the public
    endpoint throttle tests fill the anon/IP throttle bucket. Without
    this fixture, the 60/min limit is hit after about 60 unauth'd
    requests and every subsequent admin endpoint returns 403 instead
    of the expected 200/400/404.
    """
    cache.clear()
    yield
    cache.clear()


# ---------------------------------------------------------------------------
# Auth helpers — mirror the pdf_import conftest.
# ---------------------------------------------------------------------------
def _login(client: APIClient, email: str, password: str = "x") -> None:
    client.post(
        "/api/v1/auth/login",
        data={"email": email, "password": password},
        format="json",
    )


@pytest.fixture
def authed_client(api_client: APIClient, org_a) -> APIClient:
    """api_client logged in as org_a's owner."""
    _login(api_client, "owner-a@example.com")
    return api_client


@pytest.fixture
def authed_client_b(api_client: APIClient, org_b) -> APIClient:
    """api_client logged in as org_b's owner."""
    _login(api_client, "owner-b@example.com")
    return api_client


# ---------------------------------------------------------------------------
# AI mocking helpers
# ---------------------------------------------------------------------------
class _FakeAIModule:
    """Quacks like the ``openai`` / ``anthropic`` module for tests."""

    def __init__(self, name: str, parsed):
        self.name = name
        self._parsed = parsed

    def client(self, parsed):
        return _build_fake_openai(parsed)


def _build_fake_openai(parsed):
    """Return a MagicMock that quacks like the ``openai`` module."""
    module = MagicMock(name="openai")
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = _json_dumps(parsed)
    module.OpenAI.return_value.chat.completions.create.return_value = response
    return module


def _build_fake_anthropic(parsed):
    module = MagicMock(name="anthropic")
    response = MagicMock()
    block = MagicMock()
    block.text = _json_dumps(parsed)
    response.content = [block]
    module.Anthropic.return_value.messages.create.return_value = response
    return module


def _json_dumps(d):
    import json

    return json.dumps(d)


def _stub_settings(
    openai_key: str = "sk-test",
    anthropic_key: str = "",
    openai_model: str = "gpt-4o",
    anthropic_model: str = "claude-3-5-sonnet-20241022",
):
    class _S:
        pass

    s = _S()
    s.OPENAI_API_KEY = openai_key
    s.OPENAI_DEFAULT_MODEL = openai_model
    s.ANTHROPIC_API_KEY = anthropic_key
    s.ANTHROPIC_DEFAULT_MODEL = anthropic_model
    # Bulk limit — keeps the test fast even when we exercise the cap.
    s.AI_DESCRIPTION_BULK_MAX_ITEMS = 50
    s.AI_TRANSLATION_MAX_CHARS = 2000
    return s


# ---------------------------------------------------------------------------
# Context managers — short-hand for patching the service module.
# ---------------------------------------------------------------------------
@contextmanager
def patch_settings(stub):
    """Patch ``apps.translate.services.settings`` with our stub."""
    from apps.translate import services

    with patch.object(services, "settings", new=stub):
        yield


@contextmanager
def patch_get_openai(fake):
    from apps.translate import services

    with patch.object(services, "_get_openai", return_value=fake):
        yield


@contextmanager
def patch_get_anthropic(fake):
    from apps.translate import services

    with patch.object(services, "_get_anthropic", return_value=fake):
        yield


# ---------------------------------------------------------------------------
# Pre-baked AI responses
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_translation_response() -> dict:
    """OpenAI json_schema response for the translate endpoint."""
    return {
        "translated": "Turkish Coffee",
        "confidence": 0.94,
    }


@pytest.fixture
def sample_description_response() -> dict:
    """OpenAI json_schema response for the describe endpoint."""
    return {
        "description": (
            "Geleneksel Türk kahvesi, ince çekilmiş ve bakır cezvede "
            "hazırlanan bir kahve çeşididir. (İçindekiler: kafein.)"
        ),
        "confidence": 0.91,
    }
