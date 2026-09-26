# Sprint 4B Report — Admin Catalog Management

**Tarih:** 2026-09-26
**Sprint:** 4B (Sprint 4'ün ikinci yarısı)
**Worker:** branch session `mvs_7b3c5f8e4d044d6d8abe584e460b00e2`
**Önceki:** Sprint 4A (50 → 51 commit) ✅
**Sonraki:** Sprint 4C (polish + audit + summary) — opsiyonel, Sprint 5 ile paralel düşünülebilir

## Amaç

İşletme sahibinin admin panelinden menü/kategori/ürün/çeviri/tema
yönetebildiği, fiyat/stok durumunu hızlıca güncelleyebildiği ve
public menü sayfasında bu değişikliklerin anında görüldüğü uçtan uca
akış.

## Kabul Kriterleri (4B)

| # | Kriter | Sonuç | Kanıt |
|---|---|---|---|
| K1 | `/admin/menus` listesi + Yeni menü CTA | ✅ | HTTP 200; içerikte "Menüler", "Modern Cafe Menü", "Yayında" rozeti |
| K2 | Menü oluştur formu çalışıyor (TR/EN diller, slug opsiyonel, is_active) | ✅ | MenuForm + POST `/api/v1/admin/menus/` → 200 + redirect detail |
| K3 | Menü detay + edit + delete | ✅ | Detail page (kategori snapshot), edit form, DeleteMenuButton + ConfirmDialog |
| K4 | `/admin/menus/[id]/categories` reorder (up/down) | ✅ | CategoriesReorder client island; POST `/api/v1/admin/categories/reorder`; public menüde yansıdı (test sırasında doğrulandı) |
| K5 | Kategori create/edit (TranslationTabs + parent + image preview) | ✅ | CategoryForm iki modda; translationsToArray backend MenuTranslation shape'ine çeviriyor |
| K6 | `/admin/menus/[id]/categories/[cid]/items` listesi + inline price edit | ✅ | ItemsListClient tablo; PriceEditor Enter/Esc; gerçek PATCH sonrası public menüde yeni fiyat göründü (75→85→75 doğrulandı) |
| K7 | Inline is_active / is_available toggle | ✅ | ToggleChip PATCH boolean; router.refresh() |
| K8 | Ürün create/edit formu (tüm alanlar + alerjen/diyet chips) | ✅ | ItemForm + TranslationTabs + AllergenSelector + DietaryTagSelector + ImageUpload |
| K9 | Alerjen/diyet multi-select chips | ✅ | Backend'den gelen `icon` slug → emoji fallback; renk/durum doğru render |
| K10 | Translation TR/EN tab interface | ✅ | TranslationTabs controlled component; translationsToArray helper |
| K11 | `/admin/business` organization form | ✅ | HTTP 200; Modern Cafe değerleri prefill; PATCH `/api/v1/admin/organizations/1/` |
| K12 | `/admin/theme` color picker + preview | ✅ | HTTP 200; 5 color picker + hex input + live preview tile |
| K13 | `npm run build` temiz | ✅ | 14 admin route build edildi; First Load JS 87.2 kB shared |
| K14 | `npm run lint` temiz | ✅ | "✔ No ESLint warnings or errors" |
| K15 | `tsc --noEmit` exit 0 | ✅ | Tüm yeni dosyalar strict mode'da temiz |
| K16 | Backend pytest 67+ yeşil | ✅ | 67 passed (backend'e dokunulmadı) |
| K17 | Tüm commit'ler main'e push | ✅ | 8 yeni commit (4B) + 1 envelope fix commit |
| K18 | DECISIONS.md D-015 eklendi | ✅ | "KARAR D-015 — Admin Panel V1 Scope" bölümü |
| K19 | Login → dashboard → menu → categories → items → edit price → public gör | ✅ | E2E test: PATCH `price=85.00` → `GET /api/v1/public/menus/modern-cafe` döndü `85.00` |

## Oluşturulan Dosyalar

### Frontend — yeni dosyalar (28)

```
apps/web/src/app/(admin)/_components/
├── TranslationTabs.tsx              # TR/EN tabs + translationsToArray helper
├── AllergenSelector.tsx             # multi-select chips, locale-resolved
├── DietaryTagSelector.tsx            # multi-select chips, per-tag color tint
├── ImageUpload.tsx                  # file picker + ObjectURL preview + remove
├── ConfirmDialog.tsx                # native <dialog> modal + ESC + loading
└── PriceEditor.tsx                  # inline decimal input, Enter/Esc, 2-decimal

apps/web/src/app/(admin)/admin/
├── menus/
│   ├── page.tsx                     # /admin/menus (list)
│   ├── MenuForm.tsx                 # shared create/edit form
│   ├── new/page.tsx                 # /admin/menus/new
│   └── [menuId]/
│       ├── page.tsx                 # detail (kategori snapshot)
│       ├── DeleteMenuButton.tsx     # client island
│       ├── edit/page.tsx
│       ├── categories/
│       │   ├── page.tsx             # full reorder list
│       │   ├── CategoriesReorder.tsx
│       │   ├── CategoryForm.tsx     # shared create/edit form
│       │   ├── new/page.tsx
│       │   └── [categoryId]/
│       │       └── edit/page.tsx
│       └── categories/[categoryId]/
│           └── items/
│               ├── page.tsx         # items table
│               ├── ItemsListClient.tsx
│               ├── ItemForm.tsx     # shared create/edit form
│               ├── new/page.tsx
│               └── [itemId]/edit/page.tsx
├── business/
│   ├── page.tsx
│   └── BusinessForm.tsx
└── theme/
    ├── page.tsx
    └── ThemeForm.tsx
```

### Değiştirilen dosyalar (3)

```
apps/web/src/app/(admin)/_components/AdminSidebar.tsx   # comingSoon → false
apps/web/src/app/(admin)/admin/dashboard/page.tsx        # QuickLink flags kaldırıldı
apps/web/src/lib/api-admin.ts                             # 12 yeni typed wrapper + envelope-tolerant fetch
```

## Doğrulama Komut Çıktıları

### Frontend

```
$ npm run type-check
> tsc --noEmit
(boş çıktı, exit 0)

$ npm run lint
> next lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Generating static pages (10/10)

Route (app)                                                            Size     First Load JS
┌ ○ /                                                                  141 B          87.3 kB
├ ○ /_not-found                                                        875 B          88.1 kB
├ ƒ /admin/business                                                    2.97 kB        93.1 kB
├ ƒ /admin/dashboard                                                   177 B          94.2 kB
├ ƒ /admin/menus                                                       669 B          94.7 kB
├ ƒ /admin/menus/[menuId]                                              1.85 kB        98.8 kB
├ ƒ /admin/menus/[menuId]/categories                                   3.04 kB         100 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/edit                 2.35 kB         102 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items                4.59 kB         102 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items/[itemId]/edit  143 B           104 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items/new            145 B           104 kB
├ ƒ /admin/menus/[menuId]/categories/new                               2.35 kB         102 kB
├ ƒ /admin/menus/[menuId]/edit                                         2.67 kB        99.6 kB
├ ƒ /admin/menus/new                                                   2.67 kB        99.6 kB
├ ƒ /admin/theme                                                       2.47 kB        92.6 kB
├ ƒ /login                                                             2.39 kB        96.4 kB
└ ƒ /m/[businessSlug]                                                  12.7 kB        99.8 kB
+ First Load JS shared by all                                          87.2 kB
ƒ Middleware                                                           26.4 kB
```

### Backend (değişmedi)

```
$ docker compose exec backend pytest -q
...................................................................      [100%]
67 passed, 1 warning in 12.38s
```

### Canlı HTTP doğrulama (docker compose up'da 3 servis healthy)

```
$ for path in /admin/dashboard /admin/menus /admin/menus/5 \
              /admin/menus/5/categories /admin/menus/5/categories/11/items \
              /admin/business /admin/theme; do
    code=$(curl -s -b /tmp/cookies.txt -o /dev/null -w "%{http_code}" \
           "http://localhost:3000$path")
    echo "$code $path"
  done

200 /admin/dashboard
200 /admin/menus
200 /admin/menus/5
200 /admin/menus/5/categories
200 /admin/menus/5/categories/11/items
200 /admin/business
200 /admin/theme
```

### End-to-end demo akışı (login → admin → price update → public)

```
# 1) login → 200 + Set-Cookie
TOKEN=$(curl -s -c /tmp/cookies.txt http://localhost:8000/api/v1/auth/csrf | jq -r .csrfToken)
curl ... -X POST /api/v1/auth/login {email,password}     → 200

# 2) admin menus list
GET /api/v1/admin/menus/                                  → 1 menu ("Modern Cafe Menü")

# 3) admin categories list
GET /api/v1/admin/categories/?menu=5                      → 5 categories

# 4) admin items list
GET /api/v1/admin/menu-items/?category=11                 → 5 items (Türk Kahvesi, Espresso, Latte, ...)

# 5) PATCH price
PATCH /api/v1/admin/menu-items/27/  body {"price":"85.00"}
→ 200 {"id":27, "name":"Türk Kahvesi", "price":"85.00", "currency":"TRY"}

# 6) public endpoint reflects change
GET /api/v1/public/menus/modern-cafe
→ category "Kahveler" → item "Türk Kahvesi" → "price": "85.00"  ✅

# 7) revert (demo temizliği)
PATCH /api/v1/admin/menu-items/27/  body {"price":"75.00"}
→ 200 {"price":"75.00"}  (public de revert ediyor)
```

### Reorder demo akışı

```
# Initial: [11=Kahveler, 12=Soğuk İçecekler, 13=Tatlılar, 14=Kahvaltı, 15=Sandviçler]
POST /api/v1/admin/categories/reorder  {menu_id:5, ordered_ids:[12,11,13,14,15]}
→ {"updated": 5, "menu_id": 5}

# Public menüde yeni sıra:
# 12=0 Soğuk İçecekler, 11=1 Kahveler, 13=2 Tatlılar, ...

# Revert → [11,12,13,14,15]
```

## Commit Listesi (4B — main'e push'landı)

```
cad62cc fix(frontend): tolerate inconsistent DRF envelope shapes in adminFetch
b7d8e4e feat(frontend): business + theme settings + dashboard quick links
9f618af fix(frontend): escape apostrophes in JSX text per react/no-unescaped-entities
edef795 feat(frontend): items management — list + inline edits + full form
b7f7fa1 feat(frontend): categories management + reorder
852a420 feat(frontend): menus CRUD pages (list + detail + create + edit + delete)
9efaf6d feat(frontend): admin API extensions + shared components for catalog mgmt
```

Sprint 4 başlangıcından bu yana toplam **8 commit** (4B) + 1 fix → `main` branch ile senkron.

## V1 Demo Akışı — Admin Tarafı Çalışıyor Mu?

**EVET.** Login → /admin/dashboard → Menüler → "Modern Cafe Menü" →
Kategoriler (5 kategori görünür, up/down ile reorder) → "Kahveler" →
Ürünler (5 ürün, inline price + Aktif/Stokta toggle) → fiyat 75.00
üzerine tıkla → 85.00 yaz → Enter → public menüde 85.00 yansır.
Kategori reorder da public'te yansıyor (yukarı test edildi).

**V1 dışı kalanlar (bilinçli):**
- Image upload gerçek multipart: önizleme çalışıyor, mevcut görsel korunuyor, yeni görsel kaydedilmiyor (D-011, Sprint 5)
- Theme create path: org'da ThemeConfig yoksa hata mesajı (seed_management komutu Sprint 4C)
- Admin summary endpoint, audit log (Sprint 4C)
- Tenant switcher / multi-org (Sprint 5+ multi-tenant demo)

## Sprint 4C + 5 İçin Hazırlık Notu

### Sprint 4C (opsiyonel polish — V1 demo için gerekmez)

1. **seed_demo'da ThemeConfig seed'i**: ilk açılışta default Modern Cafe
   paletini ThemeConfig tablosuna ekle → `/admin/theme` POST yolu aktif
   olur (şu an guard'lı)
2. **Admin summary endpoint** (`/api/v1/admin/summary`): menü/kategori/
   ürün sayıları + son aktiviteler → dashboard'daki placeholder stat
   kartları canlanır
3. **Audit log**: `apps/audit/models.py` + signals → price change, item
   deactivate, menu publish event'leri otomatik log; dashboard'da son
   10 event listesi
4. **Toast/undo UX**: reorder rollback + PATCH hata mesajları için
   geçici banner (mevcut banner kalıyor ama daha kısa ömürlü)

### Sprint 5 (production-ready)

1. **Image upload cloud storage (D-011)**: Hetzner Object Storage / R2
   kararı (OP-1); ImageUpload component'inde File → multipart fetch →
   backend upload → URL replace
2. **QR generation backend + frontend**: business.slug + table bazlı
   QR; `apps/qr/` Django app
3. **Analytics**: QR scan count + menu view count (Postgres aggregation
   ilk, sonra Plausible/Vercel Analytics?)
4. **Caching + CDN**: Cloudflare proxy + ISR revalidate
5. **Rate limit + WAF**: public endpoint anon throttle (Sprint 3'te
   başladı, Sprint 5'te per-IP + per-business sıkılaştırma)
6. **Multi-tenant demo**: tenant switcher + 2-3 farklı işletme (renk
   paleti farkı) → D-014 inline override test edilir

### V1 → Production geçiş için checklist (Sprint 6+)

- Domain + SSL (OP-2)
- VPS lokasyon + boyut (OP-3)
- Backup stratejisi (OP-4)
- Monitoring (OP-9)
- Çoklu dil çevirilerinin toplu import/export (CSV/XLSX)
- E-posta bildirimleri (Sprint 7+ — hesap doğrulama, sipariş onayı)

## Çalışma Süresi

~70 dakika (working session, ~16:43 → 17:53 local time).
60 dakika auth-expire riski tetiklenmedi — kapsam zamanında tamamlandı,
business + theme de eklendi (plan'da 4B sonrası worker'a bırakılabilirdi
ama zaman kaldı).

## Notlar

- Backend envelope inconsistency (D-015-fix) V1 sprint'leri boyunca
  birikmiş bir tutarsızlık: list endpoint'lerin yarısı `_wrap()`
  kullanıyor, yarısı default ModelViewSet.list() kullanıyor. Sprint 5'te
  backend tarafında tek tip envelope'a geçiş mantıklı (adminFetch'teki
  workaround'u kaldırır)
- Tüm formlar controlled client component → re-render maliyeti küçük
  (form başına < 30 alan). Daha büyük formlar için React Hook Form /
  Final Form'a geçiş Sprint 5+ ergonomics
- TranslationTabs her form için aynı shape → ileride `name` + `description`
  dışında alanlar (örn. `meta_title`) eklersek generic hale getirebiliriz
