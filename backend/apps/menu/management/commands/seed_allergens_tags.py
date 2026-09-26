"""Seed Allergens + DietaryTags reference data.

Idempotent — running multiple times won't duplicate rows (uses
``get_or_create`` keyed on the ``code`` slug).

Allergens (8): gluten, dairy, nuts, eggs, soy, fish, shellfish, sesame
Dietary tags (6): vegan, vegetarian, spicy, popular, new, gluten_free
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.menu.models import Allergen, DietaryTag


ALLERGENS = [
    {
        "code": "gluten",
        "name": {"tr": "Gluten", "en": "Gluten"},
        "icon": "wheat",
        "description": "Buğday, arpa, çavdar ve yulaf içeren tahıllar.",
    },
    {
        "code": "dairy",
        "name": {"tr": "Süt Ürünleri", "en": "Dairy"},
        "icon": "milk",
        "description": "Süt ve sütten elde edilen tüm ürünler.",
    },
    {
        "code": "nuts",
        "name": {"tr": "Kuruyemiş", "en": "Nuts"},
        "icon": "nut",
        "description": "Badem, fındık, ceviz, antep fıstığı vb.",
    },
    {
        "code": "eggs",
        "name": {"tr": "Yumurta", "en": "Eggs"},
        "icon": "egg",
        "description": "Yumurta ve yumurta içeren ürünler.",
    },
    {
        "code": "soy",
        "name": {"tr": "Soya", "en": "Soy"},
        "icon": "bean",
        "description": "Soya ve soya türevleri.",
    },
    {
        "code": "fish",
        "name": {"tr": "Balık", "en": "Fish"},
        "icon": "fish",
        "description": "Balık ve balık ürünleri.",
    },
    {
        "code": "shellfish",
        "name": {"tr": "Kabuklu Deniz Ürünleri", "en": "Shellfish"},
        "icon": "shell",
        "description": "Karides, midye, kalamar vb.",
    },
    {
        "code": "sesame",
        "name": {"tr": "Susam", "en": "Sesame"},
        "icon": "seed",
        "description": "Susam ve susam yağı.",
    },
]


DIETARY_TAGS = [
    {
        "code": "vegan",
        "name": {"tr": "Vegan", "en": "Vegan"},
        "icon": "leaf",
        "color": "#10B981",
    },
    {
        "code": "vegetarian",
        "name": {"tr": "Vejetaryen", "en": "Vegetarian"},
        "icon": "salad",
        "color": "#22C55E",
    },
    {
        "code": "spicy",
        "name": {"tr": "Acılı", "en": "Spicy"},
        "icon": "flame",
        "color": "#EF4444",
    },
    {
        "code": "popular",
        "name": {"tr": "Popüler", "en": "Popular"},
        "icon": "star",
        "color": "#F59E0B",
    },
    {
        "code": "new",
        "name": {"tr": "Yeni", "en": "New"},
        "icon": "sparkles",
        "color": "#3B82F6",
    },
    {
        "code": "gluten_free",
        "name": {"tr": "Glütensiz", "en": "Gluten Free"},
        "icon": "shield",
        "color": "#A855F7",
    },
]


class Command(BaseCommand):
    help = "Seed Allergens + DietaryTags reference data (idempotent)."

    def handle(self, *args, **options):
        created_a = 0
        for entry in ALLERGENS:
            _, created = Allergen.objects.get_or_create(
                code=entry["code"],
                defaults={
                    "name": entry["name"],
                    "icon": entry["icon"],
                    "description": entry["description"],
                    "is_active": True,
                },
            )
            if created:
                created_a += 1

        created_t = 0
        for entry in DIETARY_TAGS:
            _, created = DietaryTag.objects.get_or_create(
                code=entry["code"],
                defaults={
                    "name": entry["name"],
                    "icon": entry["icon"],
                    "color": entry["color"],
                    "is_active": True,
                },
            )
            if created:
                created_t += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Allergens: {Allergen.objects.count()} total "
                f"({created_a} created this run)"
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"DietaryTags: {DietaryTag.objects.count()} total "
                f"({created_t} created this run)"
            )
        )