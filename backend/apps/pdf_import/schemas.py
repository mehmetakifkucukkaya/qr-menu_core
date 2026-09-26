"""JSON schema for AI menu parsing — Sprint 7A (D-021).

We use OpenAI's ``json_schema`` response format to constrain the AI output
to a stable shape. Anthropic doesn't support the same constrained-output
mechanism, so the Claude call instead receives the schema verbatim in the
prompt and we parse ``response.content[0].text`` manually (see
``apps.pdf_import.services``).

Schema highlights:

* Top-level ``categories`` is an array (multi-section menus).
* Each category has ``name`` (original-language section header) + ``items``.
* Items carry the full set of fields the admin review UI needs:
  ``name``, ``description``, ``price``, ``currency``, ``allergens``,
  ``dietary_tags``, ``raw_text``, ``confidence``.
* ``required`` lists reflect the minimum guarantee we'll accept from the
  AI; missing optional fields default server-side (``price=None``,
  ``currency="TRY"``, ``description=""``, etc.).
"""

from __future__ import annotations

# JSON schema used by both providers. Kept as a module-level constant so
# the test suite can reference it without re-typing the dict literal.
MENU_PARSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Kategori adı (orijinal dilde).",
                    },
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {
                                    "type": "string",
                                    "description": "Ürün adı.",
                                },
                                "description": {
                                    "type": "string",
                                    "description": "Ürün açıklaması (opsiyonel).",
                                },
                                "price": {
                                    "type": "number",
                                    "description": "Ürün fiyatı (sayısal).",
                                },
                                "currency": {
                                    "type": "string",
                                    "description": "Para birimi kodu (TRY, EUR, USD).",
                                },
                                "allergens": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Alerjen kodları (boş olabilir).",
                                },
                                "dietary_tags": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Diyet etiket kodları (boş olabilir).",
                                },
                                "raw_text": {
                                    "type": "string",
                                    "description": "PDF'ten alınan ham satır.",
                                },
                                "confidence": {
                                    "type": "number",
                                    "minimum": 0,
                                    "maximum": 1,
                                    "description": "AI güven skoru (0-1).",
                                },
                            },
                            "required": ["name", "price"],
                        },
                    },
                },
                "required": ["name", "items"],
            },
        }
    },
    "required": ["categories"],
}


# System prompt shared by both providers — keeps instructions identical so
# a fallback doesn't degrade parse quality.
SYSTEM_PROMPT = (
    "Sen bir restoran menüsü PDF'ini yapılandırılmış JSON'a çeviren AI "
    "asistanısın. PDF'teki her kategoriyi, her ürünü, fiyatı, alerjeni ve "
    "diyet etiketini tespit et. Çıktıyı SADECE JSON schema'ya uygun olarak "
    "ver, başka metin ekleme. Fiyatı bulamadığın ürünler için price alanını "
    "null bırak. confidence alanını 0-1 arası bir sayı olarak kendi "
    "güvenine göre doldur."
)


# Field whitelist for the admin inline-edit endpoint (PATCH /items/{id}/).
# Anything outside this list is rejected with a 400 to keep the parser
# contract clean.
EDITABLE_FIELDS = frozenset(
    {
        "name",
        "description",
        "price",
        "allergens",
        "dietary_tags",
        "category_name",
    }
)