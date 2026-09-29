"""Admin for the menu app."""

from django.contrib import admin
from django.utils.html import format_html

from .models import (
    Allergen,
    DietaryTag,
    Menu,
    MenuCategory,
    MenuCategoryTranslation,
    MenuItem,
    MenuItemAllergen,
    MenuItemDietaryTag,
    MenuItemTranslation,
)


class TranslationInlineBase(admin.TabularInline):
    extra = 0
    fields = ("locale", "name", "description")


class MenuCategoryTranslationInline(TranslationInlineBase):
    model = MenuCategoryTranslation


class MenuItemTranslationInline(TranslationInlineBase):
    model = MenuItemTranslation


class MenuItemAllergenInline(admin.TabularInline):
    model = MenuItemAllergen
    extra = 0
    autocomplete_fields = ("allergen",)


class MenuItemDietaryTagInline(admin.TabularInline):
    model = MenuItemDietaryTag
    extra = 0
    autocomplete_fields = ("dietary_tag",)


# ---------------------------------------------------------------------------
# Menu
# ---------------------------------------------------------------------------
@admin.register(Menu)
class MenuAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "organization",
        "branch",
        "slug",
        "default_locale",
        "is_active",
        "published_at",
        "updated_at",
    )
    list_filter = ("is_active", "default_locale", "organization")
    search_fields = ("name", "slug", "organization__name")
    readonly_fields = ("created_at", "updated_at", "published_at")
    autocomplete_fields = ("organization", "branch")
    prepopulated_fields = {"slug": ("name",)}


# ---------------------------------------------------------------------------
# MenuCategory
# ---------------------------------------------------------------------------
@admin.register(MenuCategory)
class MenuCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "menu",
        "parent",
        "slug",
        "sort_order",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_active", "menu__organization")
    search_fields = ("name", "slug", "menu__name")
    autocomplete_fields = ("menu", "parent")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")
    inlines = [MenuCategoryTranslationInline]


# ---------------------------------------------------------------------------
# MenuItem
# ---------------------------------------------------------------------------
@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "category",
        "price_display",
        "currency",
        "is_active",
        "is_available",
        "is_featured",
        "is_popular",
        "sort_order",
        "updated_at",
    )
    list_filter = (
        "is_active",
        "is_available",
        "is_featured",
        "is_popular",
        "is_new",
        "currency",
        "category__menu",
    )
    search_fields = ("name", "description", "category__name")
    autocomplete_fields = ("menu", "category")
    readonly_fields = ("created_at", "updated_at")
    inlines = [
        MenuItemTranslationInline,
        MenuItemAllergenInline,
        MenuItemDietaryTagInline,
    ]
    fieldsets = (
        (None, {"fields": ("menu", "category", "name", "description", "image")}),
        (
            "Fiyatlandırma (OP-6)",
            {"fields": ("price", "compare_at_price", "currency")},
        ),
        (
            "Bayraklar",
            {
                "fields": (
                    "is_active",
                    "is_available",
                    "is_featured",
                    "is_popular",
                    "is_new",
                    "spice_level",
                    "sort_order",
                )
            },
        ),
        # Sprint D1 — Mevzuat uyum alanları (D-031).
        (
            "Mevzuat Bilgileri (Türk Gıda Kodeksi)",
            {
                "fields": (
                    "calories",
                    "portion_size",
                    "ingredients",
                    "legal_notes",
                    "contains_alcohol",
                    "is_halal",
                ),
                "description": (
                    "Türk Gıda Kodeksi uyumu için kalori, porsiyon, içerik bilgileri. "
                    "Alerjen uyarıları legal_notes alanına yazılır."
                ),
            },
        ),
        ("Önemli tarihler", {"fields": ("created_at", "updated_at")}),
    )

    @admin.display(description="Fiyat")
    def price_display(self, obj):
        return format_html(
            "{} {}",
            obj.price,
            obj.currency,
        )


# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------
@admin.register(Allergen)
class AllergenAdmin(admin.ModelAdmin):
    list_display = ("code", "name_tr", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("code",)
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Türkçe")
    def name_tr(self, obj):
        return (obj.name or {}).get("tr", obj.code)


@admin.register(DietaryTag)
class DietaryTagAdmin(admin.ModelAdmin):
    list_display = ("code", "name_tr", "color", "is_active", "updated_at")
    list_filter = ("is_active",)
    search_fields = ("code",)
    readonly_fields = ("created_at", "updated_at")

    @admin.display(description="Türkçe")
    def name_tr(self, obj):
        return (obj.name or {}).get("tr", obj.code)