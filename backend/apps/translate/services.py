"""AI translation + product description services — Sprint 9A.

This module is a near-mirror of ``apps.pdf_import.services`` (D-021):

* Lazy SDK import (``_get_openai`` / ``_get_anthropic``) so a missing
  key/package doesn't break unrelated code paths or unit tests.
* OpenAI primary, Anthropic fallback — the fallback only runs when
  OpenAI raises (rate limit, content policy, network, schema mismatch).
* Structured JSON output: the OpenAI call uses ``json_schema``
  response_format; Anthropic gets the schema in the prompt and we
  strip any Markdown fence manually.

Two public entry points:

* ``translate_text(text, source_locale, target_locale, organization)``
  — single string in, dict out (with a ``cached`` flag). SHA-256 of
  the normalized source is the cache key.
* ``describe_product(menu_item, locale, organization, force=False)``
  — context-aware (item + category + price + allergens) generation
  for a single menu item. ``is_edited=True`` records are not
  overwritten unless ``force=True``.

Audit events are emitted from this module (not the views) so the
business write and the audit record share one failure surface.
"""

from __future__ import annotations

import hashlib
import json
import logging
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.audit.services import record_event
from apps.menu.models import LOCALE_CHOICES, MenuItem

from .models import AIProductDescription, TranslationMemory
from .schemas import (
    DESCRIPTION_OUTPUT_SCHEMA,
    DESCRIPTION_PROMPT,
    TRANSLATION_OUTPUT_SCHEMA,
    get_translation_prompt,
    is_supported_translation_pair,
)

logger = logging.getLogger(__name__)

# Lazy SDK imports: keep the SDKs out of the import graph until they're
# actually needed. This mirrors ``apps.pdf_import.services`` so a unit
# test can ``patch.object(services, '_get_openai', ...)`` without ever
# importing the openai package.
_openai_module = None
_anthropic_module = None


def _get_openai():
    global _openai_module
    if _openai_module is None:
        import openai  # noqa: WPS433 — lazy import by design

        _openai_module = openai
    return _openai_module


def _get_anthropic():
    global _anthropic_module
    if _anthropic_module is None:
        import anthropic  # noqa: WPS433 — lazy import by design

        _anthropic_module = anthropic
    return _anthropic_module


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------
class AIProviderError(Exception):
    """Base error for both providers — the views map this to 502."""


class OpenAITranslateError(AIProviderError):
    """OpenAI translation/description call failed."""


class AnthropicTranslateError(AIProviderError):
    """Anthropic fallback failed too."""


# ---------------------------------------------------------------------------
# Public API — translate_text
# ---------------------------------------------------------------------------
def translate_text(
    text: str,
    source_locale: str,
    target_locale: str,
    organization,
) -> dict[str, Any]:
    """Translate ``text`` from ``source_locale`` to ``target_locale``.

    Returns ``{"translated", "provider", "model", "confidence", "cached"}``
    where ``cached=True`` means the answer came from
    ``TranslationMemory`` without a provider call.

    Raises ``rest_framework.exceptions.ValidationError`` (400) for
    bad input; ``AIProviderError`` for provider failure (the view
    catches this and returns 502 ``ai.provider_unavailable``).
    """
    if not isinstance(text, str):
        raise DRFValidationError({"text": "Metin alanı zorunludur."})

    normalized = text.strip()
    max_chars = settings.AI_TRANSLATION_MAX_CHARS
    if not normalized:
        raise DRFValidationError({"text": "Çeviri metni boş olamaz."})
    if len(normalized) > max_chars:
        raise DRFValidationError(
            {"text": f"Çeviri metni {max_chars} karakter sınırını aşıyor."}
        )

    valid_locales = {code for code, _ in LOCALE_CHOICES}
    if source_locale not in valid_locales:
        raise DRFValidationError(
            {"source_locale": f"Desteklenmeyen kaynak dil: {source_locale!r}."}
        )
    if target_locale not in valid_locales:
        raise DRFValidationError(
            {"target_locale": f"Desteklenmeyen hedef dil: {target_locale!r}."}
        )
    if source_locale == target_locale:
        raise DRFValidationError(
            {"target_locale": "Kaynak ve hedef dil aynı olamaz."}
        )
    if not is_supported_translation_pair(source_locale, target_locale):
        raise DRFValidationError(
            {
                "target_locale": (
                    f"Bu dil çifti için çeviri prompt'u yok: "
                    f"{source_locale!r} -> {target_locale!r}."
                )
            }
        )

    # -- Cache lookup -----------------------------------------------------
    src_hash = _hash_source(normalized)
    cached = (
        TranslationMemory.objects.filter(
            organization=organization,
            source_text_hash=src_hash,
            target_locale=target_locale,
        )
        .only(
            "translated_text",
            "ai_provider",
            "ai_model",
            "confidence",
            "source_locale",
        )
        .first()
    )
    if cached is not None:
        return {
            "translated": cached.translated_text,
            "provider": cached.ai_provider,
            "model": cached.ai_model,
            "confidence": (
                float(cached.confidence) if cached.confidence is not None else None
            ),
            "cached": True,
            "source_locale": cached.source_locale,
            "target_locale": target_locale,
        }

    # -- AI call (OpenAI primary, Anthropic fallback) ---------------------
    system_prompt = get_translation_prompt(source_locale, target_locale)
    user_message = (
        f"Kaynak dil: {source_locale}\n"
        f"Hedef dil: {target_locale}\n\n"
        f"Metin:\n{normalized}"
    )

    provider, model_name, parsed = _dispatch_translate(
        system_prompt=system_prompt,
        user_message=user_message,
    )

    translated_text = (parsed.get("translated") or "").strip()
    if not translated_text:
        raise AIProviderError(
            f"{provider} yanıtında 'translated' alanı boş."
        )
    confidence = parsed.get("confidence")
    try:
        confidence_value = (
            Decimal(str(confidence)).quantize(Decimal("0.01"))
            if confidence is not None
            else None
        )
    except Exception:  # noqa: BLE001
        confidence_value = None

    # -- Cache write-through ---------------------------------------------
    memory = TranslationMemory.objects.create(
        organization=organization,
        source_text_hash=src_hash,
        source_locale=source_locale,
        source_text=normalized[:500],
        target_locale=target_locale,
        translated_text=translated_text,
        ai_provider=provider,
        ai_model=model_name,
        confidence=confidence_value,
    )

    # -- Audit ------------------------------------------------------------
    record_event(
        organization=organization,
        action="ai_translation_generated",
        target_type="translation_memory",
        target_id=memory.id,
        target_repr=normalized[:200],
        payload={
            "source_locale": source_locale,
            "target_locale": target_locale,
            "source_text_hash": src_hash,
            "ai_provider": provider,
            "ai_model": model_name,
            "cached": False,
        },
    )

    return {
        "translated": translated_text,
        "provider": provider,
        "model": model_name,
        "confidence": (
            float(confidence_value) if confidence_value is not None else None
        ),
        "cached": False,
        "source_locale": source_locale,
        "target_locale": target_locale,
    }


# ---------------------------------------------------------------------------
# Public API — describe_product
# ---------------------------------------------------------------------------
def describe_product(
    menu_item: MenuItem,
    locale: str,
    organization,
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Generate (or return cached) AI description for ``menu_item``.

    Returns ``{"description", "provider", "model", "confidence",
    "is_edited", "regenerated"}`` where ``regenerated=True`` means the
    AI was called and the row was upserted.

    Regen guard: if an ``AIProductDescription`` row exists with
    ``is_edited=True`` and ``force=False``, we return the cached text
    without calling the AI — an admin hand-edit always wins.
    """
    if locale not in {code for code, _ in LOCALE_CHOICES}:
        raise DRFValidationError(
            {"locale": f"Desteklenmeyen dil: {locale!r}."}
        )

    existing = (
        AIProductDescription.objects.filter(
            menu_item=menu_item, locale=locale
        )
        .first()
    )
    if existing is not None and existing.is_edited and not force:
        return {
            "description": existing.generated_text,
            "provider": existing.ai_provider,
            "model": existing.ai_model,
            "confidence": (
                float(existing.confidence)
                if existing.confidence is not None
                else None
            ),
            "is_edited": True,
            "regenerated": False,
        }

    context = _build_description_context(menu_item)
    user_message = (
        f"Lütfen aşağıdaki ürün için {locale} dilinde 2-3 cümlelik "
        f"bir açıklama yaz.\n\n"
        f"Bağlam:\n{json.dumps(context, ensure_ascii=False, indent=2)}"
    )

    provider, model_name, parsed = _dispatch_describe(
        system_prompt=DESCRIPTION_PROMPT,
        user_message=user_message,
    )

    description_text = (parsed.get("description") or "").strip()
    if not description_text:
        raise AIProviderError(
            f"{provider} yanıtında 'description' alanı boş."
        )
    confidence = parsed.get("confidence")
    try:
        confidence_value = (
            Decimal(str(confidence)).quantize(Decimal("0.01"))
            if confidence is not None
            else None
        )
    except Exception:  # noqa: BLE001
        confidence_value = None

    # -- Upsert -----------------------------------------------------------
    with transaction.atomic():
        row, _created = AIProductDescription.objects.update_or_create(
            menu_item=menu_item,
            locale=locale,
            defaults={
                "organization": organization,
                "generated_text": description_text,
                "ai_provider": provider,
                "ai_model": model_name,
                "confidence": confidence_value,
                "is_edited": False,
            },
        )

    # Audit emission lives in the views (single-item + bulk) so the
    # event count matches the user-perceived operation count exactly.
    # The service stays silent — it's a pure data-layer function.

    return {
        "description": description_text,
        "provider": provider,
        "model": model_name,
        "confidence": (
            float(confidence_value) if confidence_value is not None else None
        ),
        "is_edited": False,
        "regenerated": True,
        "description_id": row.id,
    }


# ---------------------------------------------------------------------------
# Bulk — describe N items (only those without a current description)
# ---------------------------------------------------------------------------
def describe_bulk(
    menu_items: list[MenuItem],
    locale: str,
    organization,
    *,
    item_ids: list[int] | None = None,
) -> dict[str, Any]:
    """Generate descriptions for ``menu_items`` (or all when empty).

    Skips items that already have a non-empty, non-edited
    ``AIProductDescription`` in ``locale``. ``force`` is intentionally
    not exposed at the bulk level — the admin UI uses the single-item
    endpoint when it wants to overwrite.

    Returns::

        {
            "results": [{item_id, description, generated, skipped, ...}],
            "total_generated": int,
            "total_skipped": int,
        }
    """
    if locale not in {code for code, _ in LOCALE_CHOICES}:
        raise DRFValidationError(
            {"locale": f"Desteklenmeyen dil: {locale!r}."}
        )

    max_items = settings.AI_DESCRIPTION_BULK_MAX_ITEMS
    if len(menu_items) > max_items:
        raise DRFValidationError(
            {
                "item_ids": (
                    f"Toplu üretim en fazla {max_items} ürün kabul eder, "
                    f"gönderilen: {len(menu_items)}."
                )
            }
        )

    results: list[dict[str, Any]] = []
    total_generated = 0
    total_skipped = 0

    for menu_item in menu_items:
        existing = AIProductDescription.objects.filter(
            menu_item=menu_item, locale=locale
        ).first()
        if existing is not None and not existing.is_edited:
            # Already has a fresh AI-generated description → skip.
            results.append(
                {
                    "item_id": menu_item.id,
                    "description": existing.generated_text,
                    "generated": False,
                    "skipped": True,
                    "reason": "already_present",
                    "provider": existing.ai_provider,
                    "model": existing.ai_model,
                }
            )
            total_skipped += 1
            continue
        try:
            outcome = describe_product(
                menu_item=menu_item,
                locale=locale,
                organization=organization,
                force=existing.is_edited if existing else False,
            )
            results.append(
                {
                    "item_id": menu_item.id,
                    "description": outcome["description"],
                    "generated": outcome["regenerated"],
                    "skipped": not outcome["regenerated"],
                    "provider": outcome["provider"],
                    "model": outcome["model"],
                }
            )
            if outcome["regenerated"]:
                total_generated += 1
            else:
                total_skipped += 1
        except AIProviderError as exc:
            logger.warning(
                "Bulk describe failed for item=%s: %s", menu_item.id, exc
            )
            results.append(
                {
                    "item_id": menu_item.id,
                    "description": None,
                    "generated": False,
                    "skipped": True,
                    "reason": "provider_error",
                    "error": str(exc),
                }
            )
            total_skipped += 1

    # ``item_ids`` filter is informational in the response — the caller
    # already applied the filter when collecting ``menu_items``.
    return {
        "results": results,
        "total_generated": total_generated,
        "total_skipped": total_skipped,
        "locale": locale,
        "filter": {
            "item_ids": item_ids or None,
            "total_requested": len(menu_items),
        },
    }


# ---------------------------------------------------------------------------
# Orchestrators — provider dispatch
# ---------------------------------------------------------------------------
def _dispatch_translate(*, system_prompt: str, user_message: str) -> tuple[str, str, dict]:
    """OpenAI primary, Anthropic fallback for translation."""
    last_error: Exception | None = None
    try:
        return _translate_with_openai(
            system_prompt=system_prompt,
            user_message=user_message,
        )
    except (OpenAITranslateError, Exception) as exc:
        last_error = exc
        logger.warning("OpenAI translate failed: %s", exc, exc_info=False)
        if not settings.ANTHROPIC_API_KEY:
            raise AIProviderError(
                f"OpenAI başarısız ve Anthropic yapılandırılmamış: {exc}"
            ) from exc

    try:
        return _translate_with_anthropic(
            system_prompt=system_prompt,
            user_message=user_message,
        )
    except (AnthropicTranslateError, Exception) as exc:
        logger.warning("Anthropic translate fallback failed: %s", exc, exc_info=False)
        raise AIProviderError(
            f"Her iki sağlayıcı da başarısız: openai={last_error!r}, "
            f"anthropic={exc!r}"
        ) from exc


def _dispatch_describe(*, system_prompt: str, user_message: str) -> tuple[str, str, dict]:
    """OpenAI primary, Anthropic fallback for description generation."""
    last_error: Exception | None = None
    try:
        return _describe_with_openai(
            system_prompt=system_prompt,
            user_message=user_message,
        )
    except (OpenAITranslateError, Exception) as exc:
        last_error = exc
        logger.warning("OpenAI describe failed: %s", exc, exc_info=False)
        if not settings.ANTHROPIC_API_KEY:
            raise AIProviderError(
                f"OpenAI başarısız ve Anthropic yapılandırılmamış: {exc}"
            ) from exc

    try:
        return _describe_with_anthropic(
            system_prompt=system_prompt,
            user_message=user_message,
        )
    except (AnthropicTranslateError, Exception) as exc:
        logger.warning("Anthropic describe fallback failed: %s", exc, exc_info=False)
        raise AIProviderError(
            f"Her iki sağlayıcı da başarısız: openai={last_error!r}, "
            f"anthropic={exc!r}"
        ) from exc


# ---------------------------------------------------------------------------
# OpenAI implementations
# ---------------------------------------------------------------------------
def _translate_with_openai(
    *, system_prompt: str, user_message: str
) -> tuple[str, str, dict]:
    openai = _get_openai()
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise OpenAITranslateError("OPENAI_API_KEY yapılandırılmamış.")

    client = openai.OpenAI(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "translation",
                    "schema": TRANSLATION_OUTPUT_SCHEMA,
                },
            },
        )
        content = response.choices[0].message.content or ""
        parsed = json.loads(content)
    except OpenAITranslateError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise OpenAITranslateError(f"OpenAI call başarısız: {exc}") from exc

    if not isinstance(parsed, dict) or "translated" not in parsed:
        raise OpenAITranslateError(
            "OpenAI yanıtı beklenen şemayla eşleşmiyor: "
            f"keys={list(parsed.keys()) if isinstance(parsed, dict) else type(parsed).__name__}"
        )
    return ("openai", settings.OPENAI_DEFAULT_MODEL, parsed)


def _describe_with_openai(
    *, system_prompt: str, user_message: str
) -> tuple[str, str, dict]:
    openai = _get_openai()
    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise OpenAITranslateError("OPENAI_API_KEY yapılandırılmamış.")

    client = openai.OpenAI(api_key=api_key)
    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "description",
                    "schema": DESCRIPTION_OUTPUT_SCHEMA,
                },
            },
        )
        content = response.choices[0].message.content or ""
        parsed = json.loads(content)
    except OpenAITranslateError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise OpenAITranslateError(f"OpenAI call başarısız: {exc}") from exc

    if not isinstance(parsed, dict) or "description" not in parsed:
        raise OpenAITranslateError(
            "OpenAI yanıtı beklenen şemayla eşleşmiyor: "
            f"keys={list(parsed.keys()) if isinstance(parsed, dict) else type(parsed).__name__}"
        )
    return ("openai", settings.OPENAI_DEFAULT_MODEL, parsed)


# ---------------------------------------------------------------------------
# Anthropic implementations
# ---------------------------------------------------------------------------
def _strip_anthropic_fence(text: str) -> str:
    """Strip a Markdown JSON fence if Claude wrapped the response."""
    text = text.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif "```" in text:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    return text


def _translate_with_anthropic(
    *, system_prompt: str, user_message: str
) -> tuple[str, str, dict]:
    anthropic = _get_anthropic()
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise AnthropicTranslateError("ANTHROPIC_API_KEY yapılandırılmamış.")

    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=settings.ANTHROPIC_DEFAULT_MODEL,
            max_tokens=1024,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"{user_message}\n\nÇıktıyı SADECE aşağıdaki "
                        f"JSON schema'ya uygun olarak ver, başka metin "
                        f"ekleme: {json.dumps(TRANSLATION_OUTPUT_SCHEMA)}"
                    ),
                }
            ],
        )
        text = ""
        for block in response.content:
            text += getattr(block, "text", "") or ""
        text = _strip_anthropic_fence(text)
        parsed = json.loads(text)
    except AnthropicTranslateError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AnthropicTranslateError(f"Anthropic call başarısız: {exc}") from exc

    if not isinstance(parsed, dict) or "translated" not in parsed:
        raise AnthropicTranslateError(
            "Anthropic yanıtı beklenen şemayla eşleşmiyor: "
            f"keys={list(parsed.keys()) if isinstance(parsed, dict) else type(parsed).__name__}"
        )
    return ("anthropic", settings.ANTHROPIC_DEFAULT_MODEL, parsed)


def _describe_with_anthropic(
    *, system_prompt: str, user_message: str
) -> tuple[str, str, dict]:
    anthropic = _get_anthropic()
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise AnthropicTranslateError("ANTHROPIC_API_KEY yapılandırılmamış.")

    client = anthropic.Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=settings.ANTHROPIC_DEFAULT_MODEL,
            max_tokens=1024,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"{user_message}\n\nÇıktıyı SADECE aşağıdaki "
                        f"JSON schema'ya uygun olarak ver, başka metin "
                        f"ekleme: {json.dumps(DESCRIPTION_OUTPUT_SCHEMA)}"
                    ),
                }
            ],
        )
        text = ""
        for block in response.content:
            text += getattr(block, "text", "") or ""
        text = _strip_anthropic_fence(text)
        parsed = json.loads(text)
    except AnthropicTranslateError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AnthropicTranslateError(f"Anthropic call başarısız: {exc}") from exc

    if not isinstance(parsed, dict) or "description" not in parsed:
        raise AnthropicTranslateError(
            "Anthropic yanıtı beklenen şemayla eşleşmiyor: "
            f"keys={list(parsed.keys()) if isinstance(parsed, dict) else type(parsed).__name__}"
        )
    return ("anthropic", settings.ANTHROPIC_DEFAULT_MODEL, parsed)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _hash_source(normalized_text: str) -> str:
    """SHA-256 hex of the normalized source text (utf-8 encoded)."""
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()


def _build_description_context(menu_item: MenuItem) -> dict[str, Any]:
    """Collect the bits of menu_item context we feed to the description prompt.

    Pulled into a single helper so the prompt template stays stable
    across refactors: the dict keys are part of the contract with the
    AI (changing the names would silently degrade output quality).
    """
    allergens = sorted({a.code for a in menu_item.allergens.all()})
    dietary = sorted({t.code for t in menu_item.dietary_tags.all()})
    price_value = (
        f"{menu_item.price} {menu_item.currency}"
        if menu_item.price is not None
        else "fiyat belirtilmemiş"
    )
    price_segment = _price_segment(menu_item.price)
    return {
        "name": menu_item.name,
        "category": menu_item.category.name if menu_item.category_id else "",
        "price": price_value,
        "price_segment": price_segment,
        "currency": menu_item.currency,
        "allergens": allergens,
        "dietary_tags": dietary,
        "is_featured": menu_item.is_featured,
        "is_popular": menu_item.is_popular,
        "spice_level": menu_item.spice_level,
    }


def _price_segment(price: Decimal | None) -> str:
    """Rough price segment — purely descriptive, used by the prompt."""
    if price is None:
        return "unknown"
    try:
        amount = float(price)
    except (TypeError, ValueError):
        return "unknown"
    if amount < 50:
        return "budget"
    if amount < 150:
        return "mid"
    if amount < 400:
        return "premium"
    return "luxury"


# Re-export for test convenience (so test code can patch a single symbol)
__all__ = [
    "AIProviderError",
    "OpenAITranslateError",
    "AnthropicTranslateError",
    "translate_text",
    "describe_product",
    "describe_bulk",
]
