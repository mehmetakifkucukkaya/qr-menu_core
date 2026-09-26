"""Translation fallback service.

Resolves the localized name/description for a category or item with a 3-tier
fallback chain:

    1. translation for the requested locale
    2. translation for the menu's default locale
    3. the default field on the model itself

Returns a dict including ``locale_used`` so callers (and tests) can see which
tier fired.
"""

from __future__ import annotations

from typing import TypedDict


class ResolvedText(TypedDict):
    name: str
    description: str
    locale_used: str  # "requested" | "default" | "model"


def _resolve(
    *,
    translations_qs,
    requested_locale: str,
    default_locale: str,
    fallback_name: str,
    fallback_description: str,
) -> ResolvedText:
    """Internal helper used by both resolve_* functions below."""
    tr = translations_qs.filter(locale=requested_locale).first()
    if tr is not None:
        return {
            "name": tr.name,
            "description": tr.description or fallback_description,
            "locale_used": "requested",
        }
    if requested_locale != default_locale:
        tr = translations_qs.filter(locale=default_locale).first()
        if tr is not None:
            return {
                "name": tr.name,
                "description": tr.description or fallback_description,
                "locale_used": "default",
            }
    return {
        "name": fallback_name,
        "description": fallback_description,
        "locale_used": "model",
    }


def resolve_category_translation(category, locale: str) -> ResolvedText:
    """Resolve localized text for a MenuCategory."""
    return _resolve(
        translations_qs=category.translations.all(),
        requested_locale=locale,
        default_locale=category.menu.default_locale,
        fallback_name=category.name,
        fallback_description=category.description,
    )


def resolve_item_translation(item, locale: str) -> ResolvedText:
    """Resolve localized text for a MenuItem."""
    return _resolve(
        translations_qs=item.translations.all(),
        requested_locale=locale,
        default_locale=item.menu.default_locale,
        fallback_name=item.name,
        fallback_description=item.description,
    )