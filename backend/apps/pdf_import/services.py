"""AI provider abstraction + draft confirmation — Sprint 7A (D-021).

The module exposes three public functions:

* ``parse_menu_pdf(pdf_path)`` — orchestrates the AI call. Tries OpenAI
  first; on any exception (rate limit, content policy, network) falls back
  to Anthropic. Returns ``(provider, model, parsed_dict)`` or raises
  ``AIProviderError`` when both providers fail.
* ``confirm_draft(draft, user, menu_name, ...)`` — bulk-saves the parsed
  items into the existing ``Menu`` / ``MenuCategory`` / ``MenuItem``
  models atomically. Writes an audit event and flips the draft to
  ``confirmed``.

Provider SDKs are imported lazily inside each helper so a missing key
(or a missing package) doesn't break the import of unrelated code paths.
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any

from django.conf import settings
from django.db import transaction

from apps.audit.services import record_event

from .schemas import MENU_PARSE_SCHEMA, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Lazy SDK imports: keep the SDKs out of the import graph until they're
# actually needed so unit tests can run without network access and so a
# missing key doesn't break unrelated code paths. ``_openai_module`` /
# ``_anthropic_module`` are filled in on first use.
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
    """Base error for both providers — used by views to return 502."""


class OpenAIParseError(AIProviderError):
    """OpenAI-specific parse failure (network, content policy, schema…)."""


class AnthropicParseError(AIProviderError):
    """Anthropic-specific parse failure."""


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------
def parse_menu_pdf(pdf_path: str) -> tuple[str, str, dict]:
    """Parse a menu PDF using OpenAI primary + Anthropic fallback.

    Returns ``(provider, model, parsed_data)`` where ``provider`` is one of
    ``"openai"`` / ``"anthropic"`` and ``parsed_data`` matches
    ``MENU_PARSE_SCHEMA``.

    Raises ``AIProviderError`` when both providers fail — the caller maps
    this to a 502 with code ``ai.parse_failed``.
    """
    last_error: Exception | None = None
    try:
        return _parse_with_openai(pdf_path)
    except (OpenAIParseError, Exception) as exc:
        last_error = exc
        logger.warning("OpenAI parse failed: %s", exc, exc_info=False)
        if not settings.ANTHROPIC_API_KEY:
            # No fallback configured — bubble up immediately.
            raise AIProviderError(
                f"OpenAI başarısız ve Anthropic yapılandırılmamış: {exc}"
            ) from exc

    # Fallback path
    try:
        return _parse_with_anthropic(pdf_path)
    except (AnthropicParseError, Exception) as exc:
        logger.warning("Anthropic fallback also failed: %s", exc, exc_info=False)
        raise AIProviderError(
            f"Her iki sağlayıcı da başarısız: openai={last_error!r}, anthropic={exc!r}"
        ) from exc


# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------
def _parse_with_openai(pdf_path: str) -> tuple[str, str, dict]:
    """OpenAI GPT-4o call with structured-output json_schema."""
    openai = _get_openai()

    api_key = settings.OPENAI_API_KEY
    if not api_key:
        raise OpenAIParseError("OPENAI_API_KEY yapılandırılmamış.")

    client = openai.OpenAI(api_key=api_key)

    # Upload the PDF for vision. We use purpose='vision' so the file is
    # eligible for inclusion in chat.completions messages. We delete it
    # in the finally block regardless of success.
    with open(pdf_path, "rb") as fh:
        file_obj = client.files.create(file=fh, purpose="vision")

    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Bu PDF menüsünü analiz et ve JSON schema'ya "
                                "uygun şekilde parse et."
                            ),
                        },
                        {"type": "file", "file_id": file_obj.id},
                    ],
                },
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "menu_parse",
                    "schema": MENU_PARSE_SCHEMA,
                },
            },
        )

        content = response.choices[0].message.content or ""
        parsed = json.loads(content)
        if not isinstance(parsed, dict) or "categories" not in parsed:
            keys_repr = (
                list(parsed.keys())
                if isinstance(parsed, dict)
                else type(parsed).__name__
            )
            raise OpenAIParseError(
                f"OpenAI yanıtı beklenen şemayla eşleşmiyor: keys={keys_repr}"
            )
        return ("openai", settings.OPENAI_DEFAULT_MODEL, parsed)
    except OpenAIParseError:
        raise
    except Exception as exc:  # noqa: BLE001 — surface any SDK error as ours
        raise OpenAIParseError(f"OpenAI call başarısız: {exc}") from exc
    finally:
        # Best-effort cleanup of the uploaded file. OpenAI retains vision
        # files for 30 days by default; explicit delete is cheaper than
        # waiting for GC.
        try:
            client.files.delete(file_obj.id)
        except Exception:  # pragma: no cover — never block on cleanup
            pass


# ---------------------------------------------------------------------------
# Anthropic
# ---------------------------------------------------------------------------
def _parse_with_anthropic(pdf_path: str) -> tuple[str, str, dict]:
    """Anthropic Claude 3.5 Sonnet call — used when OpenAI fails."""
    anthropic = _get_anthropic()

    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        raise AnthropicParseError("ANTHROPIC_API_KEY yapılandırılmamış.")

    client = anthropic.Anthropic(api_key=api_key)

    with open(pdf_path, "rb") as fh:
        pdf_data = base64.standard_b64encode(fh.read()).decode("utf-8")

    try:
        response = client.messages.create(
            model=settings.ANTHROPIC_DEFAULT_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_data,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Bu PDF menüsünü analiz et. Çıktıyı SADECE aşağıdaki "
                                "JSON schema'ya uygun olarak ver, başka metin ekleme: "
                                + json.dumps(MENU_PARSE_SCHEMA)
                            ),
                        },
                    ],
                }
            ],
        )

        text = ""
        for block in response.content:
            # response.content is a list of TextBlock / ToolUseBlock etc.
            text += getattr(block, "text", "") or ""
        text = text.strip()

        # Anthropic sometimes wraps the JSON in a Markdown fence even when
        # the system prompt says not to. Strip it before parsing.
        if "```json" in text:
            text = text.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in text:
            text = text.split("```", 1)[1].split("```", 1)[0].strip()

        parsed = json.loads(text)
        if not isinstance(parsed, dict) or "categories" not in parsed:
            keys_repr = (
                list(parsed.keys())
                if isinstance(parsed, dict)
                else type(parsed).__name__
            )
            raise AnthropicParseError(
                f"Anthropic yanıtı beklenen şemayla eşleşmiyor: keys={keys_repr}"
            )
        return ("anthropic", settings.ANTHROPIC_DEFAULT_MODEL, parsed)
    except AnthropicParseError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise AnthropicParseError(f"Anthropic call başarısız: {exc}") from exc


# ---------------------------------------------------------------------------
# Confirm (bulk save)
# ---------------------------------------------------------------------------
def confirm_draft(
    draft,
    user,
    *,
    menu_name: str,
    default_locale: str = "tr",
    is_active: bool = True,
) -> dict[str, Any]:
    """Bulk-save a parsed draft into the canonical menu models.

    Steps, all wrapped in ``transaction.atomic``:

    1. Create the ``Menu`` (organisation = draft.organisation).
    2. Group items by ``category_name`` (preserving the AI's order).
    3. Create one ``MenuCategory`` per unique name.
    4. Create ``MenuItem`` rows under the appropriate category.

    Side effects after commit:

    * Flip ``draft.status`` to ``confirmed`` and point ``draft.menu`` at
      the new menu.
    * Write an ``ai_import_confirmed`` ``AuditEvent``.

    Returns ``{menu_id, category_count, item_count}``.
    """
    # Local imports to avoid a circular-import risk: apps.menu imports
    # apps.core, which Django may initialise before pdf_import's apps.py
    # runs.
    from apps.menu.models import Menu, MenuCategory, MenuItem

    if draft.status != "parsed":
        raise ValueError(
            f"Draft onaylanamaz: durum={draft.status!r} (sadece 'parsed' kabul edilir)."
        )

    items_qs = draft.items.all().order_by("category_name", "sort_order", "id")

    # Group items by category_name, preserving the *insertion order* of
    # each category — not the alphabetical category_name order. Sorting
    # by category_name puts "Sıcak" after "Soğuk" under some collations
    # (the Turkish dotless 'ı' has a high Unicode codepoint), which
    # would surprise the operator. We rely on the lowest item id per
    # category as a stable proxy for the order the AI emitted the rows.
    by_category: dict[str, list] = {}
    category_first_seen: dict[str, int] = {}
    for item in items_qs:
        by_category.setdefault(item.category_name, []).append(item)
        if item.category_name not in category_first_seen:
            category_first_seen[item.category_name] = item.id

    # Re-sort by first-seen id so the category ordering matches the AI's
    # section order rather than the alphabetical order of category names.
    ordered_categories = sorted(
        by_category.keys(), key=lambda c: category_first_seen[c]
    )

    with transaction.atomic():
        menu = Menu.objects.create(
            organization=draft.organization,
            name=menu_name,
            default_locale=default_locale,
            is_active=is_active,
        )

        for sort_order, cat_name in enumerate(ordered_categories):
            items = by_category[cat_name]
            category = MenuCategory.objects.create(
                menu=menu,
                name=cat_name,
                sort_order=sort_order,
                is_active=True,
            )
            for item_sort, item in enumerate(items):
                MenuItem.objects.create(
                    menu=menu,
                    category=category,
                    name=item.name,
                    description=item.description,
                    price=item.price,
                    currency=item.currency or "TRY",
                    sort_order=item_sort,
                    is_active=True,
                    is_available=True,
                )

        draft.status = "confirmed"
        draft.menu = menu
        draft.save(update_fields=["status", "menu", "updated_at"])

    # Audit outside the transaction — recording audit must not block the
    # business write, but a failure here is still surfaced (record_event
    # intentionally doesn't swallow exceptions).
    record_event(
        organization=draft.organization,
        action="ai_import_confirmed",
        target_type="menu",
        target_id=menu.id,
        target_repr=f"{menu.name} (PDF import)",
        payload={
            "draft_id": draft.id,
            "item_count": sum(len(v) for v in by_category.values()),
            "ai_provider": draft.ai_provider,
            "ai_model": draft.ai_model,
        },
    )

    return {
        "menu_id": menu.id,
        "category_count": len(by_category),
        "item_count": sum(len(v) for v in by_category.values()),
    }