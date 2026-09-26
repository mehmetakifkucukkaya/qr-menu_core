"""Parsing service tests — Sprint 7A (D-021).

Covers the AI provider orchestration in ``apps.pdf_import.services``:

* OpenAI happy path (structured JSON).
* OpenAI failure → Anthropic fallback.
* Both providers fail → ``AIProviderError``.
* Mid-parse response that doesn't match the schema → provider-specific
  parse error.

We patch the lazy ``_get_openai`` / ``_get_anthropic`` helpers in
``services`` so we never actually hit a network SDK.
"""

from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest

from apps.pdf_import import services


pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers — fake OpenAI / Anthropic client + response objects.
# ---------------------------------------------------------------------------
def _fake_openai_module(parsed):
    """Return a MagicMock that quacks like the ``openai`` module."""
    module = MagicMock(name="openai")
    file_obj = MagicMock(id="file-abc")
    module.OpenAI.return_value.files.create.return_value = file_obj
    response = MagicMock()
    response.choices = [MagicMock()]
    response.choices[0].message.content = _json_dumps(parsed)
    module.OpenAI.return_value.chat.completions.create.return_value = response
    return module


def _fake_anthropic_module(parsed):
    """Return a MagicMock that quacks like the ``anthropic`` module."""
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
    """Return a settings mock with the supplied AI key config."""

    class _S:
        pass

    s = _S()
    s.OPENAI_API_KEY = openai_key
    s.OPENAI_DEFAULT_MODEL = openai_model
    s.ANTHROPIC_API_KEY = anthropic_key
    s.ANTHROPIC_DEFAULT_MODEL = anthropic_model
    return s


# ---------------------------------------------------------------------------
# OpenAI happy path
# ---------------------------------------------------------------------------
def test_parsing_openai_success(tmp_path, pdf_bytes, sample_openai_response):
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    fake_openai = _fake_openai_module(sample_openai_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        provider, model, parsed = services.parse_menu_pdf(str(pdf_file))

    assert provider == "openai"
    assert model == "gpt-4o"
    assert parsed == sample_openai_response


def test_parsing_anthropic_fallback_on_openai_error(
    tmp_path, pdf_bytes, sample_openai_response
):
    """If OpenAI raises, the orchestrator falls back to Anthropic."""
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    # Broken OpenAI: files.create works, chat raises.
    broken_openai = MagicMock(name="openai")
    broken_openai.OpenAI.return_value.files.create.return_value = MagicMock(id="f")
    broken_openai.OpenAI.return_value.chat.completions.create.side_effect = (
        RuntimeError("rate limit")
    )
    fake_anthropic = _fake_anthropic_module(sample_openai_response)

    with (
        patch_settings(_stub_settings(anthropic_key="sk-ant")),
        patch_get_openai(broken_openai),
        patch_get_anthropic(fake_anthropic),
    ):
        provider, model, parsed = services.parse_menu_pdf(str(pdf_file))

    assert provider == "anthropic"
    assert model == "claude-3-5-sonnet-20241022"
    assert parsed == sample_openai_response


def test_parsing_fails_when_both_providers_unavailable(tmp_path, pdf_bytes):
    """Both providers configured but both fail → AIProviderError."""
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    broken_openai = MagicMock(name="openai")
    broken_openai.OpenAI.return_value.files.create.return_value = MagicMock(id="f")
    broken_openai.OpenAI.return_value.chat.completions.create.side_effect = (
        RuntimeError("openai down")
    )
    broken_anthropic = MagicMock(name="anthropic")
    broken_anthropic.Anthropic.return_value.messages.create.side_effect = (
        RuntimeError("anthropic down")
    )

    with (
        patch_settings(_stub_settings(anthropic_key="sk-ant")),
        patch_get_openai(broken_openai),
        patch_get_anthropic(broken_anthropic),
    ):
        with pytest.raises(services.AIProviderError):
            services.parse_menu_pdf(str(pdf_file))


def test_parsing_handles_invalid_json_response(tmp_path, pdf_bytes):
    """If OpenAI returns non-JSON, the parse step raises OpenAIParseError."""
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    bad_openai = MagicMock(name="openai")
    bad_openai.OpenAI.return_value.files.create.return_value = MagicMock(id="f")
    bad_resp = MagicMock()
    bad_resp.choices = [MagicMock()]
    bad_resp.choices[0].message.content = "not json"
    bad_openai.OpenAI.return_value.chat.completions.create.return_value = bad_resp

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(bad_openai),
    ):
        with pytest.raises(services.AIProviderError):
            services.parse_menu_pdf(str(pdf_file))


def test_parsing_handles_missing_categories_key(tmp_path, pdf_bytes):
    """OpenAI returns valid JSON but missing ``categories`` → error."""
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    bad_openai = MagicMock(name="openai")
    bad_openai.OpenAI.return_value.files.create.return_value = MagicMock(id="f")
    bad_resp = MagicMock()
    bad_resp.choices = [MagicMock()]
    bad_resp.choices[0].message.content = _json_dumps({"foo": "bar"})
    bad_openai.OpenAI.return_value.chat.completions.create.return_value = bad_resp

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(bad_openai),
    ):
        with pytest.raises(services.AIProviderError):
            services.parse_menu_pdf(str(pdf_file))


def test_parsing_anthropic_strips_markdown_fence(
    tmp_path, pdf_bytes, sample_openai_response
):
    """Anthropic might wrap the JSON in a `````json … ````` fence."""
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    fenced = "```json\n" + _json_dumps(sample_openai_response) + "\n```"

    ant_mod = MagicMock(name="anthropic")
    response = MagicMock()
    block = MagicMock()
    block.text = fenced
    response.content = [block]
    ant_mod.Anthropic.return_value.messages.create.return_value = response

    with (
        patch_settings(_stub_settings(openai_key="", anthropic_key="sk-ant")),
        patch_get_anthropic(ant_mod),
    ):
        provider, model, parsed = services.parse_menu_pdf(str(pdf_file))

    assert provider == "anthropic"
    assert parsed == sample_openai_response


def test_parsing_no_keys_configured(tmp_path, pdf_bytes):
    """Both keys empty → the orchestrator surfaces an AIProviderError."""
    pdf_file = tmp_path / "menu.pdf"
    pdf_file.write_bytes(pdf_bytes)

    with patch_settings(_stub_settings(openai_key="", anthropic_key="")):
        with pytest.raises(services.AIProviderError) as exc_info:
            services.parse_menu_pdf(str(pdf_file))

    msg = str(exc_info.value).lower()
    assert "openai" in msg or "yapılandırılmamış" in msg


# ---------------------------------------------------------------------------
# Local patching context helpers — keep the test bodies readable.
# ---------------------------------------------------------------------------
@contextmanager
def patch_settings(stub):
    with patch.object(services, "settings", new=stub):
        yield


@contextmanager
def patch_get_openai(fake):
    with patch.object(services, "_get_openai", return_value=fake):
        yield


@contextmanager
def patch_get_anthropic(fake):
    with patch.object(services, "_get_anthropic", return_value=fake):
        yield