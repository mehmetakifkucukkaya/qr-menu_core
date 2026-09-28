"""JSON schema + system prompts for AI translation / description — Sprint 9A.

We mirror the D-021 pattern from ``apps.pdf_import.schemas``:

* OpenAI uses ``response_format={"type": "json_schema", ...}`` with the
  strict schema declared below. The Python SDK enforces the schema at
  the provider, so the parsing path is the same one we already have.
* Anthropic doesn't support structured-output — Claude is given the
  schema verbatim in the prompt and the response text is parsed in
  ``services._translate_with_anthropic``.

Locale pairs:

* V1 supports TR↔EN, TR↔DE (the three locales seeded by ``apps.menu``.
  A future Sprint 9X can add ``ar`` / ``ru`` — until then requests for
  an unseeded locale return 400 ``translate.unsupported_locale``.
* System prompts are short and *explicit about register* (restaurant
  menu terminology, allergen vocabulary) so a fallback doesn't
  degrade quality.
"""

from __future__ import annotations

from apps.menu.models import LOCALE_CHOICES

# -- Locales supported by the translate endpoint --------------------------
# ``LOCALE_CHOICES`` is the canonical source of truth (TR / EN).
# Translation prompts are however only defined for a subset — see
# ``SUPPORTED_TRANSLATION_PAIRS`` below.
SUPPORTED_LOCALES: tuple[str, ...] = tuple(code for code, _ in LOCALE_CHOICES)


# -- Translation output schema -------------------------------------------
# Both providers are constrained to return ``{"translated": str,
# "confidence": number}``. We deliberately keep the schema flat — the
# admin UI only needs the translated string + a confidence badge.
TRANSLATION_OUTPUT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "translated": {
            "type": "string",
            "description": (
                "Çevrilmiş metin. Kaynak anlamı koruyacak şekilde, doğal "
                "ve akıcı olmalı."
            ),
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Çeviri güven skoru (0-1).",
        },
    },
    "required": ["translated"],
    # ``confidence`` is a soft field — providers sometimes omit it.
    "additionalProperties": False,
}


# -- Description output schema -------------------------------------------
# The admin UI renders the description as a single paragraph under the
# item name; we keep it short and structured so the prompt can ask for
# "2-3 sentences" + inline allergen callout.
DESCRIPTION_OUTPUT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "description": {
            "type": "string",
            "description": (
                "2-3 cümlelik SEO-dostu ürün açıklaması. Alerjen uyarısı "
                "varsa cümle sonunda parantez içinde belirt."
            ),
        },
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Açıklama güven skoru (0-1).",
        },
    },
    "required": ["description"],
    "additionalProperties": False,
}


# -- System prompts per locale pair --------------------------------------
# We keep prompts short and pair-specific so OpenAI/Anthropic can pick
# the right terminology without us having to chain a "decide locale"
# pre-prompt. Pairs not in the table fall back to ``DEFAULT_PROMPT``.
DEFAULT_PROMPT = (
    "Sen bir restoran menüsü için metin çeviren/üreten AI asistanısın. "
    "Çıktıyı SADECE JSON schema'ya uygun olarak ver, başka metin ekleme. "
    "Restoran terminolojisine sadık kal; kısa ve doğal cümleler kullan."
)


TRANSLATION_PROMPTS: dict[tuple[str, str], str] = {
    ("tr", "en"): (
        "You translate Turkish restaurant menu items into English. "
        "Preserve food names (use the original Turkish term in parens "
        "only if there is no widely-used English equivalent, e.g. "
        "'Kumpir' → 'Kumpir (baked stuffed potato)'). Use idiomatic "
        "American/British English. Output MUST be only the JSON object "
        "matching the schema."
    ),
    ("en", "tr"): (
        "Bir Türkçe restoran menüsü için İngilizce'den Türkçe'ye "
        "çeviri yaparsın. Yiyecek adlarını Türk damak tadına uygun "
        "karşılıklarıyla yaz (örn. 'steak' → 'biftek', 'mashed "
        "potatoes' → 'patates püresi'). Doğal Türkçe kullan, çeviri "
        "kokmasın. Çıktı SADECE JSON olmalı."
    ),
    ("tr", "de"): (
        "Du übersetzt türkische Restaurantmenü-Einträge ins Deutsche. "
        "Verwende präzise Lebensmittelterminologie. Wenn ein türkischer "
        "Begriff im Deutschen unüblich ist, behalte ihn in Klammern "
        "(z. B. 'Kumpir (gebackene gefüllte Kartoffel)'). Output NUR "
        "das JSON-Objekt gemäß Schema."
    ),
}


def get_translation_prompt(source_locale: str, target_locale: str) -> str:
    """Return the locale-pair-specific prompt or fall back to default."""
    return TRANSLATION_PROMPTS.get(
        (source_locale, target_locale),
        DEFAULT_PROMPT,
    )


def is_supported_translation_pair(source_locale: str, target_locale: str) -> bool:
    """True iff we have a curated prompt for (src, tgt).

    Pairs we don't ship a prompt for still get translated via the
    default prompt, but we treat them as "unsupported" so the
    endpoint can return a clear 400 instead of silently degrading.
    """
    if source_locale == target_locale:
        return False
    return (source_locale, target_locale) in TRANSLATION_PROMPTS


DESCRIPTION_PROMPT = (
    "Sen bir restoran menüsü için SEO-dostu ürün açıklaması yazan AI "
    "asistanısın. Verilen ürün adı, kategori, fiyat segmenti ve alerjen "
    "listesinden 2-3 cümlelik, akıcı, müşteri çekici bir açıklama üret. "
    "Alerjen varsa son cümlede 'İçindekiler: gluten, süt' gibi parantez "
    "içinde belirt. Fiyatı doğrudan yazma; 'uygun fiyatlı', 'premium' gibi "
    "segmenti ima eden ifadeler kullan. Çıktıyı SADECE JSON schema'ya "
    "uygun olarak ver, başka metin ekleme."
)
