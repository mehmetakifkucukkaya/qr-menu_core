"""Seed demo data — admin user + Modern Cafe organization + full menu.

Sprint 1: admin user + Modern Cafe organization skeleton.
Sprint 2: adds 1 minimal Menu + 2 placeholder categories.
Sprint 3B-2: full Modern Cafe menu — 5 categories + 25 items + TR/EN
translations + M2M allergens/dietary_tags (idempotent).

Source of truth: docs/MODERN_CAFE_PRODUCTS.md.

Idempotent: re-running won't duplicate rows. Uses ``get_or_create`` for
admin user, organization, menu, categories, and items; and
``update_or_create`` for the per-locale translations and M2M relations
so re-runs refresh the TR/EN strings if the seed file changes.
"""

from __future__ import annotations

import os
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction


# ---------------------------------------------------------------------------
# Catalog — see docs/MODERN_CAFE_PRODUCTS.md
# ---------------------------------------------------------------------------
# Each item: (slug, sort_order, price_try, allergens, tags, is_featured,
#            is_popular, is_new, tr_name, en_name, tr_desc, en_desc).
# Categories: (slug, sort_order, tr_name, en_name, tr_desc, en_desc).
# ---------------------------------------------------------------------------

CATEGORIES: list[tuple[str, int, str, str, str, str]] = [
    (
        "kahveler",
        1,
        "Kahveler",
        "Coffees",
        "Modern kavurma teknikleriyle hazırlanan özel kahve çekirdeklerinden elde edilen, geleneksel ve modern yöntemlerin harmanlandığı bir koleksiyon.",
        "A collection where traditional and modern brewing methods blend with carefully selected coffee beans.",
    ),
    (
        "soguk-icecekler",
        2,
        "Soğuk İçecekler",
        "Cold Drinks",
        "Yaz günlerine özel, buz gibi soğuk ve ferahlatıcı içecekler koleksiyonu.",
        "An ice-cold, refreshing drink collection crafted for warm afternoons.",
    ),
    (
        "tatlilar",
        3,
        "Tatlılar",
        "Desserts",
        "Geleneksel ve modern tariflerin harmanlandığı, her biri usta ellerden çıkmış ev yapımı tatlılar.",
        "Homemade desserts where traditional and modern recipes blend, each crafted by master hands.",
    ),
    (
        "kahvalti",
        4,
        "Kahvaltı",
        "Breakfast",
        "Güne keyifle başlamak için sıcak, doyurucu ve özenle hazırlanmış kahvaltı seçenekleri.",
        "Warm, generous and carefully prepared breakfast options for a delightful start to your day.",
    ),
    (
        "sandvicler",
        5,
        "Sandviçler",
        "Sandwiches",
        "Taze malzemelerle hazırlanan, kahvaltıdan öğle yemeğine her saatin tercihi sandviçler.",
        "Sandwiches prepared with fresh ingredients, a choice for any hour from breakfast to lunch.",
    ),
]


# slug, sort_order, price, [allergens], [tags], is_featured, is_popular, is_new,
# tr_name, en_name, tr_desc, en_desc
ITEMS: list[tuple] = [
    # --- Kahveler (1-5) ---
    (
        "turk-kahvesi", 1, "75.00", [], ["popular"], False, True, False,
        "Türk Kahvesi",
        "Turkish Coffee",
        "Geleneksel cezvede yavaşça pişirilmiş, ince veya orta çekilmiş kahve. Sade, orta şekerli veya şekerli olarak servis edilir. Yanında lokum ve su ikramımızdır.",
        "Traditional slow-brewed Turkish coffee, finely or medium ground. Served plain, medium sweet or sweet, with complimentary Turkish delight and water.",
    ),
    (
        "espresso", 2, "60.00", [], ["popular"], False, True, False,
        "Espresso",
        "Espresso",
        "Tek shot, yoğun ve karakteristik kremasıyla klasik İtalyan stili espresso. Hızlı bir enerji molası için ideal.",
        "Single shot with rich, distinctive crema in classic Italian style. Perfect for a quick energy break.",
    ),
    (
        "latte", 3, "95.00", ["dairy"], ["popular"], False, True, False,
        "Latte",
        "Latte",
        "Buğdaylanmış süt ile yumuşatılmış, yumuşak içimli espresso. Üzerinde ince bir latte art desenimiz.",
        "Espresso softened with steamed milk for a smooth sip, finished with delicate latte art.",
    ),
    (
        "cappuccino", 4, "95.00", ["dairy"], ["popular"], False, True, False,
        "Cappuccino",
        "Cappuccino",
        "Eşit oranda espresso, buğdaylanmış süt ve süt köpüğünden oluşan klasik İtalyan stili. Üzerine hafif kakao serpiştirilir.",
        "Equal parts espresso, steamed milk and milk foam in classic Italian style, dusted with cocoa.",
    ),
    (
        "americano", 5, "80.00", [], [], False, False, False,
        "Americano",
        "Americano",
        "Espresso üzerine sıcak su eklenerek hazırlanan, yumuşak içimli Amerikan stili kahve.",
        "Espresso topped with hot water for a smooth, American-style cup.",
    ),
    # --- Soğuk İçecekler (6-10) ---
    (
        "iced-latte", 6, "110.00", ["dairy"], ["popular"], False, True, False,
        "Iced Latte",
        "Iced Latte",
        "Soğuk süt ve buz üzerine dökülen espresso, hafif tatlı. Yaz klasiği.",
        "Espresso poured over cold milk and ice, lightly sweetened. A summer classic.",
    ),
    (
        "cold-brew", 7, "120.00", [], ["new"], False, False, True,
        "Cold Brew",
        "Cold Brew",
        "Soğuk suda 16 saat demlenen, düşük asiditeli ve yumuşak içimli kahve. Buz üzerinde servis edilir.",
        "16-hour cold steeped coffee with low acidity and smooth body, served over ice.",
    ),
    (
        "frappe", 8, "130.00", ["dairy"], ["new"], False, False, True,
        "Frappé",
        "Frappé",
        "Çırpılmış buz, espresso ve sütün köpürtülmesiyle hazırlanan kremamsı soğuk kahve.",
        "Creamy iced coffee made with blended ice, espresso and milk.",
    ),
    (
        "limonata", 9, "85.00", [], [], False, False, False,
        "Limonata",
        "Lemonade",
        "Taze sıkılmış limon, nane ve doğal şeker ile hazırlanan ev yapımı limonata. Buz gibi servis edilir.",
        "Homemade lemonade with freshly squeezed lemon, mint and natural sugar. Served ice cold.",
    ),
    (
        "berry-smoothie", 10, "145.00", [], ["vegan", "gluten_free"], False, False, False,
        "Berry Smoothie",
        "Berry Smoothie",
        "Çilek, ahududu ve böğürtlen karışımından hazırlanan kremamsı smoothie. Bitkisel süt ile zenginleştirilmiştir.",
        "Creamy smoothie from a blend of strawberry, raspberry and blackberry, enriched with plant-based milk.",
    ),
    # --- Tatlılar (11-15) ---
    (
        "tiramisu", 11, "145.00", ["gluten", "dairy", "eggs"], ["popular"], False, True, False,
        "Tiramisu",
        "Tiramisu",
        "Mascarpone, espresso ve kadifemsi kadife kakao arasında katmanlanmış klasik İtalyan tatlısı.",
        "Classic Italian dessert layered between mascarpone, espresso and velvety cocoa.",
    ),
    (
        "cheesecake", 12, "155.00", ["gluten", "dairy", "eggs"], [], False, False, False,
        "Cheesecake",
        "Cheesecake",
        "Bisküvili taban üzerinde kremamsı Philadelphia peyniri. Üzerine taze meyve sosu.",
        "Creamy Philadelphia cheese on a biscuit base, topped with fresh fruit sauce.",
    ),
    (
        "brownie", 13, "125.00", ["gluten", "dairy", "eggs", "nuts"], ["popular"], False, True, False,
        "Brownie",
        "Brownie",
        "Yoğun çikolata, erimiş parçacıklarıyla dolu sıcak servis brownie. Yanında vanilya dondurması.",
        "Rich chocolate brownie served warm with melted chunks, accompanied by vanilla ice cream.",
    ),
    (
        "san-sebastian", 14, "175.00", ["gluten", "dairy", "eggs"], [], True, False, False,
        "San Sebastian Cheesecake",
        "San Sebastian Cheesecake",
        "İçi akışkan, üzeri karamelize burnt Basque usulü cheesecake. Modern Cafe'nin imza tatlısı.",
        "Burnt Basque-style cheesecake with a custardy interior and caramelized top. Modern Cafe's signature dessert.",
    ),
    (
        "macaron", 15, "165.00", ["gluten", "dairy", "eggs", "nuts"], ["new"], False, False, True,
        "Macaron (4'lü)",
        "Macaron (4 pieces)",
        "Fransız usulü çıtır badem kabuklu, kremamsı dolgulu dört farklı renkte makaron: vanilya, çikolata, fıstık, frambuaz.",
        "French-style crispy almond shells with creamy fillings in four flavors: vanilla, chocolate, pistachio and raspberry.",
    ),
    # --- Kahvaltı (16-20) ---
    (
        "serpme-kahvalti", 16, "650.00", ["gluten", "dairy", "eggs"], ["vegetarian"], False, False, False,
        "Serpme Kahvaltı (2 Kişilik)",
        "Turkish Breakfast Spread (for 2)",
        "Beyaz peynir, kaşar, sucuk, salam, sosis, bal-kaymak, tereyağı, zeytin, çeşitli reçeller, domates-salatalık, yumurtalı ekmek. İki kişiliktir.",
        "White cheese, kashar, soudjouk, salami, sausage, honey-clotted cream, butter, olives, assorted jams, tomato-cucumber, bread with eggs. Serves two.",
    ),
    (
        "menemen", 17, "145.00", ["eggs"], ["vegetarian", "popular"], False, True, False,
        "Menemen",
        "Menemen (Turkish Scrambled Eggs)",
        "Tereyağında kavrulmuş biber, domates ve yumurtanın buluştuğu sıcacık Türk klasiği. Ekmekle servis edilir.",
        "Warm Turkish classic with peppers, tomato and eggs sautéed in butter. Served with bread.",
    ),
    (
        "avokado-tost", 18, "165.00", ["gluten"], ["vegan", "popular"], False, True, False,
        "Avokado Tost",
        "Avocado Toast",
        "Çekirdeksiz avokado ezmesi, cherry domates, kırmızı soğan ve limon. Ekşi maya ekmeğinde.",
        "Mashed avocado, cherry tomatoes, red onion and lemon on sourdough bread.",
    ),
    (
        "pankek", 19, "155.00", ["gluten", "dairy", "eggs"], ["vegetarian", "popular"], False, True, False,
        "Pankek",
        "Pancakes",
        "Üç kat yumuşak pankek, taze çilek ve yaban mersini, akçaağaç şurubu ve tereyağı ile.",
        "Three fluffy pancakes with fresh strawberries and blueberries, maple syrup and butter.",
    ),
    (
        "granola-bowl", 20, "145.00", ["nuts"], ["vegan", "gluten_free"], False, False, False,
        "Granola Bowl",
        "Granola Bowl",
        "Ev yapımı granola, bitkisel yoğurt, taze meyveler (muz, çilek, yaban mersini), chia tohumu ve bal yerine akçaağaç şurubu.",
        "House granola, plant-based yogurt, fresh fruit (banana, strawberry, blueberry), chia seeds and maple syrup.",
    ),
    # --- Sandviçler (21-25) ---
    (
        "club-sandwich", 21, "195.00", ["gluten", "dairy", "eggs"], ["popular"], False, True, False,
        "Club Sandwich",
        "Club Sandwich",
        "Tavuk, bacon, marul, domates ve yumurta ile klasik üç katmanlı club sandwich. Patates cipsi yanında.",
        "Classic triple-decker with chicken, bacon, lettuce, tomato and egg. Served with potato chips.",
    ),
    (
        "tuna-sandwich", 22, "185.00", ["gluten", "fish", "eggs"], [], False, False, False,
        "Tuna Sandwich",
        "Tuna Sandwich",
        "Ton balığı, kornişon, kırmızı soğan, marul ve mayonez. Ekşi maya ekmeğinde.",
        "Tuna, cornichons, red onion, lettuce and mayonnaise on sourdough bread.",
    ),
    (
        "veggie-sandwich", 23, "175.00", ["gluten"], ["vegan"], False, False, False,
        "Veggie Sandwich",
        "Veggie Sandwich",
        "Roka, ızgara kabak, patlıcan, biber, kurutulmuş domates ve humus. Ciabatta ekmeğinde.",
        "Arugula, grilled zucchini, eggplant, pepper, sun-dried tomato and hummus on ciabatta.",
    ),
    (
        "chicken-panini", 24, "195.00", ["gluten", "dairy"], ["popular"], False, True, False,
        "Chicken Panini",
        "Chicken Panini",
        "Marine edilmiş tavuk göğsü, mozzarella, fesleğen pesto ve kiraz domates. Sıcak basılmış panini ekmeğinde.",
        "Marinated chicken breast, mozzarella, basil pesto and cherry tomatoes on a hot-pressed panini.",
    ),
    (
        "blt", 25, "175.00", ["gluten", "eggs"], [], False, False, False,
        "BLT",
        "BLT",
        "Bacon, marul, domates ve mayonez. Tost ekmeğinde. Klasik ve doyurucu.",
        "Bacon, lettuce, tomato and mayonnaise on toast bread. Classic and satisfying.",
    ),
]


class Command(BaseCommand):
    help = (
        "Seed demo data: admin user + Modern Cafe organization + "
        "1 menu + 5 categories + 25 items + TR/EN translations + "
        "allergen/tag M2M (idempotent)."
    )

    def handle(self, *args, **options):
        from apps.accounts.models import Membership, MembershipRole, User, UserRole
        from apps.menu.models import (
            Allergen,
            DietaryTag,
            Menu,
            MenuCategory,
            MenuItem,
            MenuItemAllergen,
            MenuCategoryTranslation,
            MenuItemDietaryTag,
            MenuItemTranslation,
        )
        from apps.organizations.models import Organization

        admin_email = os.environ.get("DEMO_ADMIN_EMAIL", "admin@modern-cafe.local")
        admin_password = os.environ.get("DEMO_ADMIN_PASSWORD", "change-me-demo-only")
        org_slug = os.environ.get("DEMO_BUSINESS_SLUG", "modern-cafe")
        menu_slug = "modern-cafe-menu"

        with transaction.atomic():
            user, _ = User.objects.get_or_create(
                email=admin_email,
                defaults={
                    "full_name": "Modern Cafe Admin",
                    "role": UserRole.ADMIN,
                    "is_staff": True,
                    "is_superuser": True,
                },
            )
            # Always (re)set password so reseeds after an env change pick up.
            user.set_password(admin_password)
            user.is_staff = True
            user.is_superuser = True
            user.role = UserRole.ADMIN
            user.is_active = True
            user.save()

            organization, _ = Organization.objects.get_or_create(
                slug=org_slug,
                defaults={
                    "name": "Modern Cafe",
                    "legal_name": "Modern Cafe Ltd. Şti.",
                    "description": "Modern Cafe — kahve, tatlı ve brunch.",
                    "default_locale": "tr",
                    "supported_locales": ["tr", "en"],
                    "currency": "TRY",
                    "phone": "+90 212 555 0123",
                    "whatsapp_phone": "+90 532 555 0123",
                    "email": "hello@modern-cafe.example",
                    "address": "Caferağa Mahallesi, Moda Caddesi No:42, Kadıköy, İstanbul",
                    "instagram_url": "https://instagram.com/modern.cafe.tr",
                    "is_active": True,
                },
            )

            Membership.objects.get_or_create(
                user=user,
                organization=organization,
                defaults={"role": MembershipRole.OWNER},
            )

            # --- Menu ---
            menu, menu_created = Menu.objects.get_or_create(
                organization=organization,
                slug=menu_slug,
                defaults={
                    "name": "Modern Cafe Menü",
                    "description": "Kahve, soğuk içecekler, tatlı ve brunch.",
                    "default_locale": "tr",
                    "supported_locales": ["tr", "en"],
                    "is_active": True,
                },
            )

            # --- Categories ---
            created_cats = 0
            cat_by_slug: dict[str, MenuCategory] = {}
            for (
                cat_slug,
                cat_sort_order,
                cat_tr_name,
                cat_en_name,
                cat_tr_desc,
                cat_en_desc,
            ) in CATEGORIES:
                cat, created = MenuCategory.objects.get_or_create(
                    menu=menu,
                    slug=cat_slug,
                    defaults={
                        "name": cat_tr_name,
                        "description": cat_tr_desc,
                        "sort_order": cat_sort_order,
                        "is_active": True,
                    },
                )
                if created:
                    created_cats += 1
                cat_by_slug[cat_slug] = cat

                # Per-locale translations (refresh on re-seed so copy edits
                # in this file flow through).
                MenuCategoryTranslation.objects.update_or_create(
                    category=cat,
                    locale="tr",
                    defaults={"name": cat_tr_name, "description": cat_tr_desc},
                )
                MenuCategoryTranslation.objects.update_or_create(
                    category=cat,
                    locale="en",
                    defaults={"name": cat_en_name, "description": cat_en_desc},
                )

            # --- Items ---
            allergen_index = {a.code: a for a in Allergen.objects.all()}
            tag_index = {t.code: t for t in DietaryTag.objects.all()}
            created_items = 0
            for (
                _slug,
                sort_order,
                price_str,
                allergen_codes,
                tag_codes,
                is_featured,
                is_popular,
                is_new,
                tr_name,
                en_name,
                tr_desc,
                en_desc,
            ) in ITEMS:
                # Distribute to the right category based on sort_order ranges.
                category = self._category_for_sort_order(
                    sort_order, cat_by_slug
                )
                if category is None:
                    continue

                item, item_created = MenuItem.objects.get_or_create(
                    category=category,
                    sort_order=sort_order,
                    defaults={
                        "menu": menu,
                        "name": tr_name,
                        "description": tr_desc,
                        "price": Decimal(price_str),
                        "currency": "TRY",
                        "is_active": True,
                        "is_available": True,
                        "is_featured": is_featured,
                        "is_popular": is_popular,
                        "is_new": is_new,
                        "spice_level": 0,
                    },
                )
                if not item_created:
                    # Keep price + flags in sync on re-seed.
                    item.name = tr_name
                    item.description = tr_desc
                    item.price = Decimal(price_str)
                    item.is_featured = is_featured
                    item.is_popular = is_popular
                    item.is_new = is_new
                    item.is_active = True
                    item.is_available = True
                    item.save()
                else:
                    created_items += 1

                # Per-locale translations.
                MenuItemTranslation.objects.update_or_create(
                    menu_item=item,
                    locale="tr",
                    defaults={"name": tr_name, "description": tr_desc},
                )
                MenuItemTranslation.objects.update_or_create(
                    menu_item=item,
                    locale="en",
                    defaults={"name": en_name, "description": en_desc},
                )

                # M2M allergens — clear then re-add so removed allergens
                # disappear and new ones show up on the next run.
                if allergen_codes:
                    MenuItemAllergen.objects.filter(menu_item=item).delete()
                    for code in allergen_codes:
                        allergen = allergen_index.get(code)
                        if allergen is None:
                            continue
                        MenuItemAllergen.objects.get_or_create(
                            menu_item=item,
                            allergen=allergen,
                        )
                    item.allergens.set(
                        [allergen_index[c] for c in allergen_codes if c in allergen_index]
                    )

                if tag_codes:
                    MenuItemDietaryTag.objects.filter(menu_item=item).delete()
                    for code in tag_codes:
                        tag = tag_index.get(code)
                        if tag is None:
                            continue
                        MenuItemDietaryTag.objects.get_or_create(
                            menu_item=item,
                            dietary_tag=tag,
                        )
                    item.dietary_tags.set(
                        [tag_index[c] for c in tag_codes if c in tag_index]
                    )

        self.stdout.write(self.style.SUCCESS("Demo seed OK"))
        self.stdout.write(f"  admin user   : {admin_email}  (id={user.pk})")
        self.stdout.write(
            f"  organization : {organization.name}  (slug={organization.slug}, id={organization.pk})"
        )
        self.stdout.write(
            f"  menu         : {menu.name}  (slug={menu.slug}, id={menu.pk}, "
            f"created={menu_created})"
        )
        self.stdout.write(
            f"  categories   : {MenuCategory.objects.filter(menu=menu).count()} "
            f"({created_cats} created this run)"
        )
        self.stdout.write(
            f"  items        : {MenuItem.objects.filter(menu=menu).count()} "
            f"({created_items} created this run)"
        )
        self.stdout.write(
            f"  translations : "
            f"{MenuItemTranslation.objects.count()} items + "
            f"{MenuCategoryTranslation.objects.count()} categories"
        )
        self.stdout.write("")
        self.stdout.write(
            "Login at: POST /api/v1/auth/login  body: "
            + '{"email":"' + admin_email + '","password":"***"}'
        )
        self.stdout.write(
            f"  (password from env DEMO_ADMIN_PASSWORD; default '{admin_password}' in local)"
        )
        if hasattr(settings, "SETTINGS_MODULE"):
            self.stdout.write(f"  Settings module: {settings.SETTINGS_MODULE}")

    @staticmethod
    def _category_for_sort_order(
        sort_order: int, cat_by_slug: dict[str, "MenuCategory"]
    ):
        """Map a sort_order to the right category bucket.

        Buckets derived from the catalog layout (MODERN_CAFE_PRODUCTS.md):
            1-5   kahveler
            6-10  soguk-icecekler
            11-15 tatlilar
            16-20 kahvalti
            21-25 sandvicler
        """
        if 1 <= sort_order <= 5:
            return cat_by_slug.get("kahveler")
        if 6 <= sort_order <= 10:
            return cat_by_slug.get("soguk-icecekler")
        if 11 <= sort_order <= 15:
            return cat_by_slug.get("tatlilar")
        if 16 <= sort_order <= 20:
            return cat_by_slug.get("kahvalti")
        if 21 <= sort_order <= 25:
            return cat_by_slug.get("sandvicler")
        return None