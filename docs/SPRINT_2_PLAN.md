# Sprint 2 — Menü Domain Backend — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 2 (2-3 gün, planlanan ~80-100 saat)
**Durum:** Planlandı → worker'a verildi
**Önceki:** Sprint 1 ✅ (14 commit, 14/14 test, /health + auth + tenant-scoped CRUD)

## Amaç

Menü, kategori, ürün, çeviri, etiket ve alerjen domain'i çalışır hale getirmek. Public menü için temel servisler hazırlanır (Sprint 3'te public endpoint test edilir).

## Alınan / Netleşen Kararlar

- D-001..D-010 + OP-11 (Sprint 1'den miras)
- **OP-6 (Sprint 2'de netleşecek):** Decimal precision = `max_digits=10, decimal_places=2` (örn. 99999999.99 TRY)
- **OP-8 (Sprint 2'de netleşecek):** `Branch.working_hours_json` şeması
- **D-011 (Sprint 2'de alınacak):** Image upload = local MEDIA_ROOT (`/app/media/`); Sprint 5'te S3/R2'ye geçilecek
- **D-012 (Sprint 2'de alınacak):** Slug = manuel giriş + opsiyonel auto (signals, pre_save); transliteration Türkçe karakter sorunu nedeniyle basit yaklaşım

## Yeni App: `apps/menu/`

```
apps/menu/
├── __init__.py · apps.py
├── models.py · admin.py · serializers.py · views.py · urls.py
├── permissions.py          (extend tenant permission)
├── services/
│   ├── __init__.py
│   ├── visibility.py       (active/passive rules)
│   ├── translation.py      (locale fallback)
│   ├── reorder.py          (sort_order update)
│   └── working_hours.py    (OP-8 şema validator)
├── management/commands/
│   ├── seed_allergens_tags.py
│   └── update_seed_demo.py  (Modern Cafe için minimal menu seed)
├── migrations/
└── tests/
    ├── conftest.py         (menu fixtures)
    ├── test_menu_crud.py
    ├── test_category_crud.py
    ├── test_item_crud.py
    ├── test_visibility.py
    ├── test_translation_fallback.py
    ├── test_decimal_price.py
    └── test_reorder.py
```

## Domain Modelleri (7 yeni + 2 M2M through)

### Menu
- `organization` FK (related_name='menus')
- `branch` FK nullable (related_name='menus', on_delete=SET_NULL)
- `name` CharField max 120
- `slug` SlugField max 60 (unique_together with organization)
- `description` TextField blank
- `default_locale` CharField (choices [('tr','Türkçe'),('en','English')], default 'tr')
- `supported_locales` JSONField default `['tr','en']`
- `is_active` BooleanField default True
- `published_at` DateTimeField nullable
- `created_at`, `updated_at`
- `unique_together: [('organization','slug')]`
- Indexes: `(organization, is_active)`

### MenuCategory
- `menu` FK (related_name='categories')
- `parent` FK self nullable (related_name='children', on_delete=CASCADE)
- `name` CharField max 80 (default locale)
- `description` TextField blank
- `image` ImageField upload_to='categories/' blank null
- `sort_order` IntegerField default 0
- `is_active` BooleanField default True
- `created_at`, `updated_at`
- `unique_together: [('menu','slug')]`

### MenuCategoryTranslation
- `category` FK (related_name='translations')
- `locale` CharField max 5 (choices)
- `name` CharField max 80
- `description` TextField blank
- `unique_together: [('category','locale')]`

### MenuItem
- `menu` FK (related_name='items')
- `category` FK (related_name='items')
- `name` CharField max 120 (default locale)
- `description` TextField blank
- `image` ImageField upload_to='items/' blank null
- `price` DecimalField `max_digits=10, decimal_places=2` (OP-6)
- `compare_at_price` DecimalField nullable (same)
- `currency` CharField max 3 default 'TRY'
- `is_active` BooleanField default True
- `is_available` BooleanField default True (kısa süreli tükenme)
- `is_featured` BooleanField default False
- `is_popular` BooleanField default False
- `is_new` BooleanField default False
- `spice_level` IntegerField default 0, choices 0-3
- `sort_order` IntegerField default 0
- `created_at`, `updated_at`
- M2M: `allergens` (through `MenuItemAllergen`), `dietary_tags` (through `MenuItemDietaryTag`)
- Indexes: `(menu, category, is_active)`

### MenuItemTranslation
- `menu_item` FK (related_name='translations')
- `locale` CharField max 5
- `name` CharField max 120
- `description` TextField blank
- `unique_together: [('menu_item','locale')]`

### Allergen
- `code` SlugField max 30 unique (gluten, dairy, nuts, eggs, soy, fish, shellfish, sesame)
- `name` JSONField `{'tr':'Gluten','en':'Gluten'}`
- `icon` CharField max 40 (lucide-react icon name, opsiyonel)
- `description` TextField blank
- `is_active` BooleanField default True
- `created_at`, `updated_at`

### DietaryTag
- `code` SlugField max 30 unique (vegan, vegetarian, spicy, popular, new, gluten_free)
- `name` JSONField `{'tr':'Vegan','en':'Vegan'}`
- `icon` CharField max 40
- `color` CharField max 7 default '#10B981' (hex validator, ThemeConfig ile aynı pattern)
- `is_active` BooleanField default True
- `created_at`, `updated_at`

### MenuItemAllergen (M2M through)
- `menu_item` FK, `allergen` FK
- `unique_together: [('menu_item','allergen')]`

### MenuItemDietaryTag (M2M through)
- `menu_item` FK, `dietary_tag` FK
- `unique_together: [('menu_item','dietary_tag')]`

## Service Layer

### `apps/menu/services/visibility.py`
```python
def get_active_menu(organization, branch=None) -> Menu | None
def get_active_categories(menu) -> QuerySet[MenuCategory]    # is_active=True, parent=None, sort by sort_order
def get_active_items(category) -> QuerySet[MenuItem]        # is_active=True, is_available=True, sort by sort_order
def get_full_menu_payload(organization, locale='tr', branch=None) -> dict
    """Sprint 3 public API için kullanılacak (şimdi yazılır, Sprint 3'te test edilir):
    { business, menu, theme, categories:[{category, items:[...]}], allergens, dietary_tags, cta }"""
```

### `apps/menu/services/translation.py`
```python
def resolve_category_translation(category, locale: str) -> dict:
    """Fallback zinciri:
    1. category.translations.filter(locale=locale).first()
    2. category.translations.filter(locale=category.menu.default_locale).first()
    3. category (default fields)
    Returns: {'name': str, 'description': str, 'locale_used': str}"""

def resolve_item_translation(item, locale: str) -> dict:
    """Aynı zincir ürün için."""
```

### `apps/menu/services/reorder.py`
```python
def reorder_categories(menu, ordered_ids: list[int]) -> None:
    """Verilen id sırasına göre sort_order günceller (transaction)."""
def reorder_items(category, ordered_ids: list[int]) -> None:
    """Aynı ürün için."""
```

### `apps/menu/services/working_hours.py` (OP-8)
```python
def validate_working_hours_schema(payload: dict) -> bool:
    """Gün anahtarları: mon,tue,wed,thu,fri,sat,sun. Her gün array of {open, close} 'HH:MM' formatında."""
def normalize_working_hours(payload: dict) -> dict:
    """Eksik günleri boş array ile doldurur."""
```

## API Endpoints (Admin)

```
GET    /api/v1/admin/menus                       → list (tenant-scoped)
POST   /api/v1/admin/menus                       → create
GET    /api/v1/admin/menus/{id}                  → retrieve
PATCH  /api/v1/admin/menus/{id}                  → update
DELETE /api/v1/admin/menus/{id}                  → delete

GET    /api/v1/admin/menus/{id}/categories       → list (active only default)
POST   /api/v1/admin/menus/{id}/categories       → create (with optional parent_id)
PATCH  /api/v1/admin/categories/{id}             → update (with optional translations)
DELETE /api/v1/admin/categories/{id}             → delete
POST   /api/v1/admin/categories/reorder          → body: {menu_id, ordered_ids: [3,1,4,2]}

GET    /api/v1/admin/menu-items                  → list (filter ?menu=X&category=Y)
POST   /api/v1/admin/menu-items                  → create (with allergen_ids, dietary_tag_ids)
GET    /api/v1/admin/menu-items/{id}             → retrieve (with translations)
PATCH  /api/v1/admin/menu-items/{id}             → update
DELETE /api/v1/admin/menu-items/{id}             → delete
POST   /api/v1/admin/menu-items/reorder          → body: {category_id, ordered_ids: [...]}

GET    /api/v1/admin/allergens                   → list active allergens
GET    /api/v1/admin/dietary-tags                → list active tags
```

Response standardı (Sprint 1'den):
```json
{ "data": {...}, "meta": {"request_id": "..."} }
```

## Seed Data

`seed_allergens_tags` komutu (idempotent):
- Allergens: gluten, dairy, nuts, eggs, soy, fish, shellfish, sesame
- Dietary tags: vegan, vegetarian, spicy, popular, new, gluten_free

`update_seed_demo` (veya `seed_demo` güncelleme): Modern Cafe için minimal menu seed:
- 1 menu (slug=modern-cafe-menu)
- 2 kategori placeholder (kahveler, soğuk içecekler)
- Kategoriler/ürünler Sprint 6'da dolu (DEMO_IMAGES.md'deki 25 ürün ile)

## OP Kararları — Sprint 2'de Netleşecek

### OP-6 — Decimal Precision
- **Karar:** `price = DecimalField(max_digits=10, decimal_places=2)` (örn. 99999999.99 TRY)
- **Gerekçe:** TRY/EUR/USD için 2 ondalık yeterli, max 10 digit toplam yeterli
- **Sonuç:** `price` + `compare_at_price` aynı precision. Negative değer kabul edilmez (validator).

### OP-8 — Working Hours JSON Şeması
- **Karar:**
```json
{
  "mon": [{"open": "08:00", "close": "22:00"}],
  "tue": [{"open": "08:00", "close": "22:00"}],
  ...
}
```
- **Default:** `{}`
- **Gerekçe:** P2 özellik ama veri şeması erkenden gerekiyor (frontend Sprint 3'te kullanabilir)
- **Sonuç:** `Branch.working_hours_json = JSONField(default=dict, blank=True)`. Schema validator `services/working_hours.py`'de. UI: Sprint 4+ (şimdilik Django admin JSONField edit).

## Test Stratejisi (25-30 test)

```
test_menu_crud.py (~5 test)
  - test_create_menu_with_branch
  - test_list_menus_tenant_scoped (org A user org A menus, org B menus görmez)
  - test_update_menu_publish_sets_published_at
  - test_unique_slug_per_organization
  - test_default_locale_tr

test_category_crud.py (~5 test)
  - test_create_category_with_image
  - test_subcategory_with_parent_fk
  - test_translation_unique_per_category_locale
  - test_sort_order_default_zero
  - test_category_inactive_excluded_from_queryset

test_item_crud.py (~6 test)
  - test_create_item_with_decimal_price
  - test_update_price_stays_decimal
  - test_create_item_with_allergens_and_tags
  - test_negative_price_rejected
  - test_toggle_is_available
  - test_featured_popular_new_flags

test_visibility.py (~4 test)
  - test_get_active_menu_returns_published_only
  - test_get_active_categories_excludes_inactive
  - test_get_active_items_excludes_unavailable
  - test_get_full_menu_payload_structure (Sprint 3 placeholder)

test_translation_fallback.py (~4 test)
  - test_requested_locale_returned_when_exists
  - test_fallback_to_default_locale_when_missing
  - test_unsupported_locale_uses_default
  - test_no_translation_uses_default_field

test_decimal_price.py (~4 test)
  - test_price_stored_as_decimal_not_float
  - test_max_digits_enforced (örn. 9999999999.99 kabul, üstü reddedilir)
  - test_decimal_places_enforced (12.999 → 13.00 veya hata)
  - test_currency_default_try

test_reorder.py (~3 test)
  - test_reorder_categories_updates_sort_order
  - test_reorder_items_within_category
  - test_reorder_validates_ownership (başka org kategorisi reorder edilemez)
```

## Commit Planı (conventional commits, ~14 commit)

```
chore(backend): menu app scaffold
feat(menu): Menu + MenuCategory + MenuItem models
feat(menu): CategoryTranslation + ItemTranslation
feat(menu): Allergen + DietaryTag models
feat(menu): MenuItemAllergen + MenuItemDietaryTag M2M through
feat(ops): seed_allergens_tags management command
feat(menu): visibility service (active/passive rules)
feat(menu): translation fallback service
feat(menu): reorder service
feat(menu): working_hours schema validator (OP-8)
feat(menu): CRUD API endpoints (menu/category/item)
feat(menu): reorder endpoints
feat(menu): allergens + dietary_tags list endpoints
feat(ops): seed_demo güncelleme (Modern Cafe minimal menu)
feat(accounts): working_hours_json Branch admin field ekleme (D-011/OP-8)
test(backend): menu + visibility + fallback + decimal + reorder tests
chore(docs): DECISIONS D-011/D-012/OP-6/OP-8 + Sprint 2 report
```

## V1 Dışı (YAPMA)

- Ürün varyasyonları (size, color) — V2
- Modifier/extra grupları — V2
- Kampanya banner — P2
- Çalışma saatleri UI (P2 — veri şeması şimdi, UI Sprint 4+)
- AI menü import — V2
- Image upload cloud storage (S3/R2) — Sprint 5 (şimdi local MEDIA_ROOT)
- Online ödeme / sipariş / POS / rezervasyon — V1 dışı

## Kabul Kriterleri (her biri kanıtlanmalı)

✅ `docker compose exec backend python manage.py migrate` → 7 yeni model migration
✅ `docker compose exec backend python manage.py seed_allergens_tags` → 8 allergen + 6 tag seed
✅ `docker compose exec backend pytest -v` → **25-30 test yeşil**
✅ curl POST `/api/v1/admin/menus` (CSRF + JSON) → 201
✅ curl POST `/api/v1/admin/menus/{id}/categories` → 201
✅ curl POST `/api/v1/admin/menu-items` (price: "12.50", allergen_ids: [1,3]) → 201
✅ curl PATCH `/api/v1/admin/menu-items/{id}` (price: "13.00") → 200, response'da Decimal
✅ curl POST `/api/v1/admin/categories/reorder` → sort_order güncellenir
✅ Pasif item `get_active_items(category)` ile dönmez (servis testi)
✅ `resolve_category_translation(category, 'en')` EN çeviri yoksa TR döner
✅ DecimalField'a 12.999 set → ya hata ya 13.00 (validation test)
✅ Tenant isolation: Org A user Org B menusını göremez (test)
✅ Tüm commit'ler branch main'e push edilmiş

## Çalıştırma Adımları (Worker)

1. Mevcut repo durumunu kontrol et (Sprint 1 commit'leri yerinde)
2. `apps/menu/` oluştur, `INSTALLED_APPS`'e ekle
3. 7 model yaz (Menu, MenuCategory, MenuCategoryTranslation, MenuItem, MenuItemTranslation, Allergen, DietaryTag) + 2 through (MenuItemAllergen, MenuItemDietaryTag)
4. Migration oluştur + uygula
5. `seed_allergens_tags` management command yaz ve çalıştır
6. services/visibility.py, translation.py, reorder.py, working_hours.py yaz
7. serializers + views + urls
8. permissions (IsOrganizationMember reuse)
9. working_hours_json Branch admin field (OP-8)
10. tests/ (25-30 test)
11. seed_demo güncelleme (Modern Cafe minimal menu)
12. docker compose build + up + migrate + seed + pytest + curl doğrulama
13. DECISIONS.md güncelle (D-011, D-012, OP-6, OP-8)
14. docs/SPRINT_2_REPORT.md oluştur
15. Commit + push (her mantıksal grup ayrı)

## Rapor (Markdown, Sprint 1 formatında)

1. Kabul kriteri checklist (✅/❌ + komut + çıktı)
2. Oluşturulan dosya listesi
3. Doğrulama komut çıktıları
4. Commit listesi
5. TODO'lar / V1-dışı
6. Sprint 3'e hazırlık notu (public API için temel)

## Notlar

- Public API (Sprint 3) için `get_full_menu_payload` şimdiden yazılır — Sprint 3'te test edilir
- Image storage local'de MEDIA_ROOT, prod'da S3/R2 (Sprint 5)
- `IsOrganizationMember` Sprint 1'den reuse
- Slug generation için Django `pre_save` signal — opsiyonel; Sprint 2'de basit tut, manuel giriş yeterli
- `compare_at_price` şimdi var ama UI yok (P2)
- `working_hours_json` validation Sprint 2'de, UI Sprint 4+
- Frontend (Next.js) hâlâ Sprint 3'te — şimdi sadece backend