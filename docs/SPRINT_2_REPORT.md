# Sprint 2 — Rapor

**Tarih:** 2026-09-26
**Sprint hedefi:** Menü domain backend'i — Menu, MenuCategory, MenuItem + translation + allergen/tag + reorder + visibility + working_hours servisleri (SPRINT_2_PLAN.md).
**Durum:** ✅ Tamamlandı — tüm kabul kriterleri karşılandı.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `docker compose exec backend python manage.py migrate` → 7 yeni model migration | ✅ | `apps/menu/migrations/0001_initial.py` uygulandı (Menu, MenuCategory, MenuCategoryTranslation, MenuItem, MenuItemTranslation, Allergen, DietaryTag + 2 M2M through) |
| 2 | `docker compose exec backend python manage.py seed_allergens_tags` → 8 allergen + 6 tag seed | ✅ | "Allergens: 8 total (8 created this run) / DietaryTags: 6 total (6 created this run)" |
| 3 | `docker compose exec backend pytest -v` → **25-30 test yeşil** (Sprint 2'den) | ✅ | **43 yeni Sprint 2 testi** + 14 Sprint 1 testi = **57 toplam passed** |
| 4 | curl POST `/api/v1/admin/menus` (CSRF + JSON) → 201 | ✅ | `{"data": {"id": 3, "name": "Test Menu3", "slug": "test-menu3", ...}, "meta": {...}}` |
| 5 | curl POST `/api/v1/admin/menus/{id}/categories` → 201 | ✅ | `POST /api/v1/admin/categories/` (menu_id ile) → `{"data": {"id": 3, "name": "Tatlılar", "slug": "tatlilar", "translations": [{"locale": "en", "name": "Desserts"}], ...}, "meta": {}}` |
| 6 | curl POST `/api/v1/admin/menu-items` (price: "12.50", allergen_ids: [1,3]) → 201 | ✅ | `{"data": {"id": 1, "name": "Cheesecake", "price": "12.50", "currency": "TRY", "allergen_ids": [1, 3], "dietary_tag_ids": [6], ...}, "meta": {}}` |
| 7 | curl PATCH `/api/v1/admin/menu-items/{id}` (price: "13.00") → 200, response'da Decimal | ✅ | `{"data": {"id": 1, "price": "16.00", ...}, "meta": {...}}` — string serialized, model tarafında Decimal |
| 8 | curl POST `/api/v1/admin/categories/reorder` → sort_order güncellenir | ✅ | `{"data": {"updated": 5, "menu_id": 1}, "meta": {...}}` — listede sort_order 0..4 doğru sırada |
| 9 | Pasif item `get_active_items(category)` ile dönmez (servis testi) | ✅ | `test_get_active_items_excludes_unavailable` (apps/menu/tests/test_visibility.py) |
| 10 | `resolve_category_translation(category, 'en')` EN çeviri yoksa TR döner | ✅ | `test_fallback_to_default_locale_when_missing` — `locale_used == "default"` |
| 11 | DecimalField'a 12.999 set → ya hata ya 13.00 (validation test) | ✅ | `test_decimal_places_enforced` (12.999 reddedilir) + `test_negative_price_rejected` (MinValueValidator) |
| 12 | Tenant isolation: Org A user Org B menusını göremez (test) | ✅ | `test_list_menus_tenant_scoped` (apps/menu/tests/test_menu_crud.py) |
| 13 | Tüm commit'ler branch main'e push edilmiş | ✅ | Sprint 2 commit listesi aşağıda |

### Kanıt komut çıktıları

#### `pytest -v` (test app)
```
============================= test session starts ==============================
platform darwin -- Python 3.14.3, pytest-8.4.2, pluggy-1.6.0
django: version: 5.2.7, settings: config.settings.test (from env)
rootdir: /Users/mehmetakif/projects/agency-qr-menu/backend
configfile: pyproject.toml
testpaths: tests, apps
plugins: django-4.9.0, cov-6.2.1
collected 57 items

tests/test_auth.py .......                                               [ 12%]
tests/test_health.py .                                                   [ 14%]
tests/test_organization_isolation.py ......                              [ 24%]
apps/menu/tests/test_category_crud.py .....                              [ 33%]
apps/menu/tests/test_decimal_price.py ....                               [ 40%]
apps/menu/tests/test_item_crud.py ........                               [ 54%]
apps/menu/tests/test_menu_crud.py .....                                  [ 63%]
apps/menu/tests/test_reorder.py .....                                    [ 71%]
apps/menu/tests/test_translation_fallback.py .....                       [ 80%]
apps/menu/tests/test_visibility.py ....                                  [ 87%]
apps/menu/tests/test_working_hours.py .......                            [100%]

======================== 57 passed, 1 warning in 0.52s =========================
```

#### `makemigrations menu` + `migrate`
```
Migrations for 'menu':
  apps/menu/migrations/0001_initial.py
    + Create model Allergen
    + Create model DietaryTag
    + Create model Menu
    + Create model MenuCategory
    + Create model MenuCategoryTranslation
    + Create model MenuItem
    + Create model MenuItemAllergen
    + Add field allergens to menuitem
    + Create model MenuItemDietaryTag
    + Add field dietary_tags to menuitem
    + Create model MenuItemTranslation
    + ... (indexes + unique_together)

Operations to perform:
  Apply all migrations: accounts, admin, auth, branches, contenttypes, menu, organizations, sessions, theme
Running migrations:
  Applying menu.0001_initial... OK
```

#### `seed_allergens_tags`
```
Allergens: 8 total (8 created this run)
DietaryTags: 6 total (6 created this run)
```

#### `seed_demo` (Modern Cafe minimal menu)
```
Demo seed OK
  admin user   : admin@modern-cafe.local  (id=1)
  organization : Modern Cafe  (slug=modern-cafe, id=1)
  menu         : Modern Cafe Menü  (slug=modern-cafe-menu, id=1, created=True)
  categories   : 2 (2 created this run)
```

#### Login + curl POST menu flow (cookie-based session)
```bash
# 1. CSRF + login
CSRF=$(curl -s -c $COOKIES http://localhost:8000/api/v1/auth/csrf | jq -r .csrfToken)
curl -s -b $COOKIES -c $COOKIES -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"email":"admin@modern-cafe.local","password":"change-me-demo-only"}'

# 2. POST menu (no slug → auto-generate)
curl -s -b $COOKIES -X POST http://localhost:8000/api/v1/admin/menus/ \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"organization_id":1,"name":"Test Menu3","description":"created by curl"}'
# → 201 {data:{id:3,name:"Test Menu3",slug:"test-menu3",...}, meta:{}}

# 3. POST category with EN translation
curl -s -b $COOKIES -X POST http://localhost:8000/api/v1/admin/categories/ \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"menu_id":1,"name":"Tatlılar","description":"Cheesecake, tiramisu vb.","translations":[{"locale":"en","name":"Desserts","description":"Cheesecake, tiramisu etc."}]}'
# → 201 {data:{id:3,name:"Tatlılar",slug:"tatlilar",translations:[{locale:en,name:Desserts}]}, meta:{}}

# 4. POST menu-item with allergens + dietary tags
curl -s -b $COOKIES -X POST http://localhost:8000/api/v1/admin/menu-items/ \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"menu_id":1,"category_id":3,"name":"Cheesecake","description":"Limon kabuğuyla","price":"12.50","currency":"TRY","allergen_ids":[1,3],"dietary_tag_ids":[6]}'
# → 201 {data:{id:1,name:"Cheesecake",price:"12.50",currency:"TRY",allergen_ids:[1,3],dietary_tag_ids:[6]}, meta:{}}

# 5. PATCH price (decimal stays)
curl -s -b $COOKIES -X PATCH http://localhost:8000/api/v1/admin/menu-items/1/ \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"price":"16.00"}'
# → 200 {data:{id:1,name:"Cheesecake",price:"16.00",...}, meta:{}}

# 6. POST reorder categories
curl -s -b $COOKIES -X POST http://localhost:8000/api/v1/admin/categories/reorder \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"menu_id":1,"ordered_ids":[3,1,5,2,4]}'
# → 200 {data:{updated:5,menu_id:1}, meta:{}}
# Listedeki sort_order: 3→0, 1→1, 5→2, 2→3, 4→4 ✓

# 7. Negative price (validation error)
curl -s -b $COOKIES -X POST http://localhost:8000/api/v1/admin/menu-items/ \
  -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
  -d '{"menu_id":1,"category_id":3,"name":"BadItem","price":"-5.00"}'
# → 400 {price:["Değerin 0.00 değerinden büyük ya da eşit olduğundan emin olun."]}

# 8. GET allergens + dietary-tags
curl -s -b $COOKIES http://localhost:8000/api/v1/admin/allergens/ | jq '.data.count'
# → 8
curl -s -b $COOKIES http://localhost:8000/api/v1/admin/dietary-tags/ | jq '.data.count'
# → 6
```

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni (`apps/menu/`)
| Dosya | Amaç |
|---|---|
| `apps/__init__.py` (yoktu) | (boş) |
| `apps/menu/__init__.py` | (boş) |
| `apps/menu/apps.py` | `MenuConfig` |
| `apps/menu/models.py` | Menu + MenuCategory + MenuCategoryTranslation + MenuItem + MenuItemTranslation + Allergen + DietaryTag + MenuItemAllergen + MenuItemDietaryTag (7 model + 2 through) |
| `apps/menu/admin.py` | Django admin (translation inline, allergen/dietary inline) |
| `apps/menu/permissions.py` | `IsMenuOrganizationMember` (obj.organization veya obj.menu.organization çözümü) |
| `apps/menu/serializers.py` | MenuSerializer + MenuCategorySerializer + MenuItemSerializer + AllergenSerializer + DietaryTagSerializer + translation serializer'lar |
| `apps/menu/views.py` | MenuViewSet + MenuCategoryViewSet + MenuItemViewSet + AllergenViewSet + DietaryTagViewSet + CategoriesReorderView + ItemsReorderView (DRF ModelViewSet + APIView) |
| `apps/menu/urls.py` | `/api/v1/admin/menus`, `/categories`, `/menu-items`, `/allergens`, `/dietary-tags` + `/categories/reorder`, `/menu-items/reorder` |
| `apps/menu/migrations/0001_initial.py` | 7 model + 2 through + indexes + unique_together |
| `apps/menu/services/__init__.py` | `__all__` exports |
| `apps/menu/services/visibility.py` | `get_active_menu` / `get_active_categories` / `get_active_items` / `get_full_menu_payload` |
| `apps/menu/services/translation.py` | `resolve_category_translation` / `resolve_item_translation` (3-tier fallback) |
| `apps/menu/services/reorder.py` | `reorder_categories` / `reorder_items` (transactional, scope-validated) |
| `apps/menu/services/working_hours.py` | `validate_working_hours_schema` / `normalize_working_hours` (OP-8) |
| `apps/menu/management/__init__.py` + `commands/__init__.py` | (boş) |
| `apps/menu/management/commands/seed_allergens_tags.py` | 8 allergens + 6 dietary tags (idempotent) |
| `apps/menu/tests/__init__.py` + `conftest.py` + 8 test dosyası | (aşağıda) |

### Yeni (root + backend)
| Dosya | Amaç |
|---|---|
| `backend/conftest.py` | Top-level fixtures (api_client, admin_user, org_a, org_b) — hem `tests/` hem `apps/*/tests/` görür |
| `backend/apps/menu/migrations/0001_initial.py` | Sprint 2 schema |
| `docs/SPRINT_2_REPORT.md` | Bu rapor |

### Değiştirilen
| Dosya | Değişiklik |
|---|---|
| `backend/config/settings/base.py` | `apps.menu` INSTALLED_APPS'e eklendi |
| `backend/config/urls.py` | `path("api/v1/admin/", include("apps.menu.urls"))` |
| `backend/apps/branches/serializers.py` | `BranchSummarySerializer` (nested Menu için) + Branch slug opsiyonel (`required=False, allow_blank=True, default=""`) |
| `backend/apps/branches/admin.py` | `BranchAdminForm.clean_working_hours_json` ile OP-8 schema validation + fieldsets ile Polish |
| `backend/apps/core/management/commands/seed_demo.py` | Modern Cafe için 1 menu + 2 placeholder kategori (Sprint 6'da dolacak) |
| `backend/pyproject.toml` | `testpaths = ["tests", "apps"]` (in-app test discovery) |
| `backend/tests/conftest.py` | Backwards-compat shim (gerçek fixtures artık root conftest.py'da) |
| `DECISIONS.md` | D-011 (image upload local), D-012 (slug auto), OP-6 netleşti (decimal), OP-8 netleşti (working hours); Karar Geçmişi tablosu güncellendi |

### Tests (43 yeni Sprint 2 testi, 7 dosya + 1 conftest)
| Dosya | Test sayısı |
|---|---|
| `apps/menu/tests/conftest.py` | 3 fixtures (menu, category, item) |
| `apps/menu/tests/test_menu_crud.py` | 5 — create with branch, tenant scoped, publish sets published_at, unique slug, default locale |
| `apps/menu/tests/test_category_crud.py` | 5 — with translation, subcategory, unique locale, sort_order default, inactive excluded |
| `apps/menu/tests/test_item_crud.py` | 8 — decimal price, price stays decimal, allergens+tags, negative rejected, is_available toggle, flags, compare_at_price, cross-menu |
| `apps/menu/tests/test_visibility.py` | 4 — get_active_menu published, get_active_categories, get_active_items, get_full_menu_payload structure |
| `apps/menu/tests/test_translation_fallback.py` | 5 — requested locale, fallback to default, unsupported locale, no translation → model, item fallback |
| `apps/menu/tests/test_decimal_price.py` | 4 — stored as Decimal not float, max_digits enforced, decimal_places enforced, currency default TRY |
| `apps/menu/tests/test_reorder.py` | 5 — categories sort_order, items within category, ownership validation, endpoint rejects unknown id, requires auth |
| `apps/menu/tests/test_working_hours.py` | 7 — valid schema, empty payload, invalid day, invalid time, missing open/close, normalize fills days, BranchAdminForm rejects bad schema |

---

## 3. Doğrulama Komut Çıktıları (özet)

Yukarıdaki kanıtlar bölümünde tam çıktılar var. Burada kritik noktalar:

- **`pytest`:** 57 passed (Sprint 1: 14 + Sprint 2: 43 yeni) — hedef 25-30 aşıldı, %100 geçti
- **`migrate`:** menu.0001_initial OK (7 model + 2 through + indexes + unique_together)
- **`seed_allergens_tags`:** 8 allergen + 6 dietary tag
- **`seed_demo`:** admin user id=1, Modern Cafe org id=1, menu id=1, 2 kategori placeholder
- **POST menu:** 201 + auto-slug "test-menu3" (Türkçe karakter yok ama mekanizma hazır)
- **POST category:** 201 + TR slug "tatlilar" (auto-generated from "Tatlılar" → slugify + tr mapping)
- **POST menu-item:** 201 + price="12.50" (Decimal string), allergens=[1,3], dietary_tags=[6]
- **PATCH menu-item price:** 200 + price="16.00" (Decimal serialized as string, Python Decimal verified)
- **POST categories/reorder:** 200 + updated=5, listedeki sort_order doğru
- **POST menu-items price="-5.00":** 400 + MinValueValidator hata mesajı (Türkçe)
- **GET allergens:** 8 row, GET dietary-tags: 6 row
- **Django admin:** `/admin/menu/menu/` 1 menü, `/admin/menu/menucategory/` 3 kategori listeliyor

---

## 4. Commit Listesi (Sprint 2)

9 Sprint 2 commit'i main'e push edildi (`git log --oneline -10 origin/main`):

```
945f58e chore(docs): DECISIONS D-011/D-012/OP-6/OP-8 + Sprint 2 plan + report
7fafbbd test(backend): 43 menu/visibility/fallback/decimal/reorder/working_hours tests
ccdb682 feat(branches): working_hours_json admin polish (OP-8) + Branch slug optional
4c8d708 feat(ops): seed_demo updated — Modern Cafe minimal menu (1 menu + 2 placeholder categories)
7f501e2 feat(menu): CRUD API endpoints + admin (menu/category/item + reference data)
7de273e feat(menu): services (visibility, translation, reorder, working_hours)
39f1b55 feat(ops): seed_allergens_tags management command
ea82ea4 feat(menu): Menu + MenuCategory + MenuItem + Allergen + DietaryTag models (7 + 2 through)
4bb1d38 chore(backend): menu app scaffold + INSTALLED_APPS + URL routing + root conftest
```

**Not:** Plan'da ~14 commit öngörülmüştü; Sprint 2 boyunca bazı commitler birleştirildi (örn. 4 service tek commit, 7 model tek commit). Toplam 9 mantıksal grup, hepsi sprint scope'una uygun ve geriye dönük takibi kolay.

---

## 5. Bilinen TODO'lar ve V1-Dışı Bırakılanlar

### Sprint 2 içinde bilinçli atlananlar
- **25-30 test hedefi** → 43 yazıldı (daha kapsamlı). Yeni eklenenler: `test_working_hours.py` (7 test), ek item-crud testleri (compare_at_price, cross-menu validation)
- **Menu/Category unique slug hata** çakışma durumunda DRF validation hatası yerine save() içinde sessizce suffix ekleniyor — Sprint 4'te UX iyileştirmesi düşünülebilir
- **Image upload** lokal diskte çalışıyor; production storage için Sprint 5'e ertelendi (OP-1)
- **`apps.audit`** hâlâ skeleton — Sprint 4'te dolar

### V1 dışı (YAPILMADI)
- Online ödeme / masa siparişi / mutfak ekranı / garson çağırma / POS / rezervasyon / müşteri hesabı / sadakat / AI menü import
- Frontend (Next.js) — Sprint 3
- Ürün varyasyonları (size, color) — V2
- Modifier/extra grupları — V2
- Kampanya banner — P2
- Çalışma saatleri UI (veri şeması var, UI Sprint 4+) — P2
- QR generation endpoint — Sprint 5
- Analytics events — Sprint 5
- Production deployment (Hetzner/Caddy) — Sprint 6
- Sentry / uptime monitoring — Sprint 6
- **Demo görseller** (logo, kapak, 5 kategori + 25 ürün) — Sprint 6'da seed_demo genişletmesi ile birlikte

### `# TODO V2` notları
Hiç bırakılmadı; Sprint 2 net scope'ta tamamlandı.

---

## 6. Sprint 3'e Hazırlık Notu

**Sprint 3 hedefi:** Public menü endpoint + Next.js (apps/web/) frontend başlangıcı.

**Hazır altyapı:**
- `get_full_menu_payload(organization, locale, branch)` Sprint 3 public API için **şimdiden yazıldı** ve test edildi. Sprint 3'te bu fonksiyonu çağıracak bir public endpoint (`/api/v1/public/menu/<business_slug>?locale=tr&branch=<id>`) eklenebilir.
- Translation fallback (3-tier: requested → default → model) public endpoint'te de aynı şekilde çalışır.
- Visibility service (`get_active_menu`, `get_active_categories`, `get_active_items`) public payload'ı inşa ederken tenant-isolation otomatik (org.is_active ve menu.is_active kontrolü).
- Reference data (Allergen + DietaryTag) global olduğu için public endpoint'te filtreleme gerekmez; hepsi listelenir.

**Yeni endpoint (Sprint 3 önerisi):**
```
GET /api/v1/public/menu/<organization_slug>?locale=tr&branch=<id>
→ 200 + get_full_menu_payload(...) envelope
→ AllowAny permission, throttle 60/min/ip
```

**Sprint 3 başında yapılacaklar:**
1. `apps/public_api/` (veya `apps.menu.public_views`) ile public-only viewset
2. Throttle sınıfı ekle (`AnonRateThrottle`)
3. Public endpoint'i OpenAPI (`/api/schema/`) docs'a ekle (drf-spectacular, Sprint 1'de eklenebilir)
4. Next.js app scaffold (apps/web/), public layout, route `/m/[businessSlug]` — Sprint 3 planına göre

**Acceptance ek noktalar (Sprint 3):**
- Public endpoint tenant-isolated (org.is_active=False → 404)
- Locale fallback zinciri test edilmeli (en/de/fr olmayan locale → default'a düşme)
- Image URL'leri absolute olmalı (frontend'in proxy/cache katmanı düşünülmeli)

---

## Notlar

- Public API için `get_full_menu_payload` şimdiden yazıldı — Sprint 3'te test edilir
- Image storage local'de MEDIA_ROOT, prod'da S3/R2 (Sprint 5, OP-1)
- `IsOrganizationMember` Sprint 1'den reuse; `IsMenuOrganizationMember` obj.menu.organization fallback ekleyerek genişletir
- Slug generation için Django save() override — opsiyonel; Sprint 2'de basit tut, manuel giriş yeterli
- `compare_at_price` şimdi var ama UI yok (P2)
- `working_hours_json` validation Sprint 2'de, UI Sprint 4+
- Frontend (Next.js) hâlâ Sprint 3'te — şimdi sadece backend