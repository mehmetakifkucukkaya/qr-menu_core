"""Visibility service — the active/passive read path used by both admin and (later) public APIs.

A menu/category/item is considered "active" when:

    Menu
        is_active=True AND (published_at is set)
        (published_at is auto-set on first activation in Menu.save())

    MenuCategory
        is_active=True AND parent is None (top-level) when listed as a
        category tree; nested children are reached via `.children`.
        The `get_active_categories` helper returns top-level only.

    MenuItem
        is_active=True AND is_available=True
        (is_available is the "sold out for today" toggle; is_active is the
        long-term hide/remove toggle.)
"""

from __future__ import annotations

from django.db.models import QuerySet

from apps.menu.models import Menu, MenuCategory, MenuItem


def get_active_menu(organization, branch=None) -> Menu | None:
    """Return the active published menu for an organization.

    When `branch` is provided, prefer menus scoped to that branch; fall back
    to org-wide menus. Returns None if nothing is published.
    """
    qs = (
        Menu.objects.filter(organization=organization, is_active=True)
        .filter(published_at__isnull=False)
        .order_by("-published_at")
    )
    if branch is not None:
        scoped = qs.filter(branch=branch)
        if scoped.exists():
            return scoped.first()
    return qs.filter(branch__isnull=True).first()


def get_active_categories(menu) -> QuerySet[MenuCategory]:
    """Top-level active categories for a menu, ordered by sort_order."""
    return (
        MenuCategory.objects.filter(menu=menu, is_active=True, parent__isnull=True)
        .order_by("sort_order", "name")
    )


def get_active_items(category) -> QuerySet[MenuItem]:
    """Active AND available items in a category, ordered by sort_order."""
    return (
        MenuItem.objects.filter(category=category, is_active=True, is_available=True)
        .order_by("sort_order", "name")
        .select_related("menu", "category")
        .prefetch_related("translations", "allergens", "dietary_tags")
    )


def get_full_menu_payload(organization, locale: str = "tr", branch=None) -> dict:
    """Build the public-facing payload (consumed by Sprint 3 endpoint).

    Shape:

        {
            "business": {...OrganizationSummary...},
            "menu": {"id":..., "name":..., "slug":..., "default_locale":...},
            "theme": {...ThemeConfig fields...} | None,
            "categories": [
                {
                    "id": ..., "slug": ..., "sort_order": ...,
                    "name": ..., "description": ..., "locale_used": ...,
                    "items": [
                        {
                            "id": ..., "slug": ..., "sort_order": ...,
                            "name": ..., "description": ..., "locale_used": ...,
                            "price": "12.50", "currency": "TRY",
                            "image": "...",
                            "is_featured": ..., "is_popular": ..., "is_new": ...,
                            "spice_level": 0,
                            "allergens": [...codes...],
                            "dietary_tags": [...codes...],
                        }
                    ],
                },
                ...
            ],
            "allergens": [...global list (reference)...],
            "dietary_tags": [...global list (reference)...],
            "cta": {"call_phone": "...", "whatsapp": "...", "instagram": "..."},
        }

    Returns a payload dict even when nothing is published (so the API can
    return a structured 200 with empty categories).
    """
    from apps.menu.models import Allergen, DietaryTag
    from apps.organizations.serializers import OrganizationSummarySerializer

    menu = get_active_menu(organization, branch=branch)
    business = OrganizationSummarySerializer(organization).data

    theme_payload = None
    theme = getattr(organization, "theme_config", None)
    if theme is not None:
        theme_payload = {
            "primary_color": theme.primary_color,
            "secondary_color": theme.secondary_color,
            "accent_color": theme.accent_color,
            "background_color": theme.background_color,
            "text_color": theme.text_color,
            "font_family": theme.font_family,
            "layout_variant": theme.layout_variant,
        }

    categories_payload: list[dict] = []
    if menu is not None:
        # Local import to avoid circular dependency.
        from apps.menu.services.translation import (
            resolve_category_translation,
            resolve_item_translation,
        )

        for category in get_active_categories(menu):
            cat_text = resolve_category_translation(category, locale)
            items_payload: list[dict] = []
            for item in get_active_items(category):
                item_text = resolve_item_translation(item, locale)
                items_payload.append(
                    {
                        "id": item.id,
                        "sort_order": item.sort_order,
                        "name": item_text["name"],
                        "description": item_text["description"],
                        "locale_used": item_text["locale_used"],
                        "price": str(item.price),
                        "compare_at_price": (
                            str(item.compare_at_price)
                            if item.compare_at_price is not None
                            else None
                        ),
                        "currency": item.currency,
                        "image": item.image.url if item.image else None,
                        "is_featured": item.is_featured,
                        "is_popular": item.is_popular,
                        "is_new": item.is_new,
                        "spice_level": item.spice_level,
                        "allergens": list(
                            item.allergens.filter(is_active=True).values_list(
                                "code", flat=True
                            )
                        ),
                        "dietary_tags": list(
                            item.dietary_tags.filter(is_active=True).values_list(
                                "code", flat=True
                            )
                        ),
                    }
                )
            categories_payload.append(
                {
                    "id": category.id,
                    "slug": category.slug,
                    "sort_order": category.sort_order,
                    "name": cat_text["name"],
                    "description": cat_text["description"],
                    "locale_used": cat_text["locale_used"],
                    "image": category.image.url if category.image else None,
                    "items": items_payload,
                }
            )

    return {
        "business": business,
        "menu": (
            {
                "id": menu.id,
                "name": menu.name,
                "slug": menu.slug,
                "default_locale": menu.default_locale,
                "supported_locales": menu.supported_locales,
                "currency": organization.currency,
            }
            if menu is not None
            else None
        ),
        "theme": theme_payload,
        "categories": categories_payload,
        "allergens": list(
            Allergen.objects.filter(is_active=True).values(
                "code", "name", "icon"
            )
        ),
        "dietary_tags": list(
            DietaryTag.objects.filter(is_active=True).values(
                "code", "name", "icon", "color"
            )
        ),
        "cta": {
            "call_phone": organization.phone,
            "whatsapp": organization.whatsapp_phone,
            "instagram": organization.instagram_url,
        },
    }