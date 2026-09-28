"""Translation service tests — Sprint 9A.

Covers ``apps.translate.services.translate_text``:

* OpenAI happy path.
* OpenAI failure → Anthropic fallback.
* Both providers fail → ``AIProviderError``.
* Cache hit on repeated translation (SHA-256 hash key).
* Validation: empty / oversized / unsupported locale / same locale.
* Whitespace normalisation.
* TranslationMemory row is created after a fresh AI call.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.exceptions import ValidationError

from apps.translate import services
from apps.translate.models import TranslationMemory

from .conftest import (
    _build_fake_anthropic,
    _build_fake_openai,
    _json_dumps,
    _stub_settings,
    patch_get_anthropic,
    patch_get_openai,
    patch_settings,
)


# ---------------------------------------------------------------------------
# OpenAI happy path
# ---------------------------------------------------------------------------
def test_translate_openai_provider_called(
    org_a, sample_translation_response
):
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.translate_text(
            text="Türk Kahvesi",
            source_locale="tr",
            target_locale="en",
            organization=org_a,
        )

    assert result["translated"] == "Turkish Coffee"
    assert result["provider"] == "openai"
    assert result["model"] == "gpt-4o"
    assert result["cached"] is False
    assert result["confidence"] == pytest.approx(0.94)


# ---------------------------------------------------------------------------
# Cache hit
# ---------------------------------------------------------------------------
def test_translate_cache_hit_returns_cached_result(
    org_a, sample_translation_response
):
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        first = services.translate_text(
            text="Türk Kahvesi",
            source_locale="tr",
            target_locale="en",
            organization=org_a,
        )

    assert first["cached"] is False
    assert TranslationMemory.objects.filter(organization=org_a).count() == 1

    # Second call — cache hit; no new AI call expected.
    call_count_before = fake_openai.OpenAI.return_value.chat.completions.create.call_count
    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        second = services.translate_text(
            text="Türk Kahvesi",
            source_locale="tr",
            target_locale="en",
            organization=org_a,
        )

    assert second["cached"] is True
    assert second["translated"] == first["translated"]
    assert second["provider"] == first["provider"]
    # No new SDK call.
    assert (
        fake_openai.OpenAI.return_value.chat.completions.create.call_count
        == call_count_before
    )


# ---------------------------------------------------------------------------
# Anthropic fallback
# ---------------------------------------------------------------------------
def test_translate_anthropic_fallback_when_openai_raises(
    org_a, sample_translation_response
):
    """OpenAI fails → orchestrator falls back to Anthropic."""
    broken_openai = MagicMock(name="openai")
    broken_openai.OpenAI.return_value.chat.completions.create.side_effect = (
        RuntimeError("rate limit")
    )
    fake_anthropic = _build_fake_anthropic(sample_translation_response)

    with (
        patch_settings(_stub_settings(anthropic_key="sk-ant")),
        patch_get_openai(broken_openai),
        patch_get_anthropic(fake_anthropic),
    ):
        result = services.translate_text(
            text="Türk Kahvesi",
            source_locale="tr",
            target_locale="en",
            organization=org_a,
        )

    assert result["provider"] == "anthropic"
    assert result["model"] == "claude-3-5-sonnet-20241022"
    assert result["cached"] is False


# ---------------------------------------------------------------------------
# Both providers fail → AIProviderError
# ---------------------------------------------------------------------------
def test_translate_both_providers_fail_returns_502_error(
    org_a,
):
    broken_openai = MagicMock(name="openai")
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
            services.translate_text(
                text="Türk Kahvesi",
                source_locale="tr",
                target_locale="en",
                organization=org_a,
            )


# ---------------------------------------------------------------------------
# Same-locale rejection
# ---------------------------------------------------------------------------
def test_translate_same_locale_rejected(org_a):
    with (
        patch_settings(_stub_settings()),
        patch_get_openai(_build_fake_openai({"translated": "x"})),
    ):
        with pytest.raises(ValidationError):
            services.translate_text(
                text="Türk Kahvesi",
                source_locale="tr",
                target_locale="tr",
                organization=org_a,
            )


# ---------------------------------------------------------------------------
# Unsupported locale (not in our curated prompt table)
# ---------------------------------------------------------------------------
def test_translate_unsupported_locale_rejected(org_a):
    with (
        patch_settings(_stub_settings()),
        patch_get_openai(_build_fake_openai({"translated": "x"})),
    ):
        # ``fr`` is not in LOCALE_CHOICES, so it gets rejected before
        # the prompt lookup — but using ``en`` is also rejected when
        # the source is ``de`` because there's no (``de``, ``en``)
        # pair in the curated prompt table.
        with pytest.raises(ValidationError):
            services.translate_text(
                text="Türk Kahvesi",
                source_locale="en",
                target_locale="de",
                organization=org_a,
            )


# ---------------------------------------------------------------------------
# Empty text
# ---------------------------------------------------------------------------
def test_translate_empty_text_rejected(org_a):
    with (
        patch_settings(_stub_settings()),
        patch_get_openai(_build_fake_openai({"translated": "x"})),
    ):
        with pytest.raises(ValidationError):
            services.translate_text(
                text="   ",
                source_locale="tr",
                target_locale="en",
                organization=org_a,
            )


# ---------------------------------------------------------------------------
# Oversized text
# ---------------------------------------------------------------------------
def test_translate_oversized_text_rejected(org_a):
    big = "a" * 2001
    with (
        patch_settings(_stub_settings()),
        patch_get_openai(_build_fake_openai({"translated": "x"})),
    ):
        with pytest.raises(ValidationError):
            services.translate_text(
                text=big,
                source_locale="tr",
                target_locale="en",
                organization=org_a,
            )


# ---------------------------------------------------------------------------
# Whitespace normalisation
# ---------------------------------------------------------------------------
def test_translate_normalizes_whitespace(
    org_a, sample_translation_response
):
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        result = services.translate_text(
            text="  Türk Kahvesi  ",
            source_locale="tr",
            target_locale="en",
            organization=org_a,
        )

    # The AI gets the stripped source; the cached row also stores it.
    memory = TranslationMemory.objects.get(organization=org_a)
    assert memory.source_text == "Türk Kahvesi"
    assert memory.source_text_hash == services._hash_source("Türk Kahvesi")
    assert result["translated"] == "Turkish Coffee"


# ---------------------------------------------------------------------------
# TranslationMemory row creation
# ---------------------------------------------------------------------------
def test_translation_memory_saved_after_ai_call(
    org_a, sample_translation_response
):
    fake_openai = _build_fake_openai(sample_translation_response)

    with (
        patch_settings(_stub_settings()),
        patch_get_openai(fake_openai),
    ):
        services.translate_text(
            text="Türk Kahvesi",
            source_locale="tr",
            target_locale="en",
            organization=org_a,
        )

    memory = TranslationMemory.objects.get(organization=org_a)
    assert memory.ai_provider == "openai"
    assert memory.ai_model == "gpt-4o"
    assert memory.source_locale == "tr"
    assert memory.target_locale == "en"
    assert memory.translated_text == "Turkish Coffee"
    assert memory.confidence == Decimal("0.94")
