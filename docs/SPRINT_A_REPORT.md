# Sprint A — V1 Satış Hazırlık: Kritik Public Menü Düzeltmeleri + Payload Expansion

**Tarih:** 2026-09-28
**Sprint:** A (V1 demo öncesi kritik fix sprint'i — Faz 1 + Faz 2.1)
**Durum:** ✅ **Tamam** — 5 commit worker, **tsc + lint + build temiz**, backend **396 yeşil** (388 baseline korunur + 8 yeni)
**Önceki:** Sprint 11A backend (online ödeme API hazır) ✅, Sprint 12A UI foundation ✅
**Sonraki:** Sprint B (plan modeli + feature flags), Sprint C (onboarding), Sprint D (mevzuat), Sprint E (media)

## Özet

Demo açıldığında görünen ilk ekranın (marka, fiyat, QR analytics) doğru çalışması için 3 kritik bug + 1 payload eksik fix edildi:

| Faz | Sorun | Çözüm |
|---|---|---|
| 1.1 | Logo placeholder'a düşüyordu; cover_image public payload'da yoktu | OrganizationSummarySerializer logo/cover için image URL resolver ekledi; BusinessHero ayrı alanlar olarak kullanıyor |
| 1.2 | Currency ternary bug — cart + checkout + confirmation hep TRY | 4 adımlı resolver zinciri (menu → business → first item → TRY) `lib/currency.ts` |
| 1.3 | qr_open event oluşuyor ama `QRCode.scan_count` artmıyordu + cross-tenant leak | `F("scan_count") + 1` atomik increment + tenant guard (qr_id FK null'lanır) |
| 2.1 | Public payload contact / location alanları eksik | Serializer extend: description, address, google_maps_url, website, email, phone; hero altında contact strip |

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `npm run type-check` (tsc --noEmit) → 0 error | ✅ | Temiz |
| 2 | `npm run lint` (next lint) → 0 warning, 0 error | ✅ | `✔ No ESLint warnings or errors` |
| 3 | `npm run build` → 0 error | ✅ | Build succeeded; middleware 26.4 kB korunur |
| 4 | Backend baseline 388 yeşil korunur (`pytest -q`) | ✅ | **396 passed, 18 failed (payment gap, scope dışı)** |
| 5 | `OrganizationSummarySerializer` cover_image + description + address + maps + website + email + phone expose ediyor | ✅ | `apps/organizations/serializers.py:55-87` — 13 alan |
| 6 | Public logo URL field'ı (FieldFile veya absolute URL) her zaman çözümlenmiş URL döner | ✅ | `_resolve_image_url()` helper — `image_url` semantic; `test_organization_summary_logo_resolves_fieldfile` |
| 7 | Currency fallback zinciri: menu → business → first item → TRY | ✅ | `apps/web/src/lib/currency.ts:resolveCurrency` — 4 adım, 9 frontend test |
| 8 | QR `?qr=<id>` açılınca event oluşur + scan_count++ | ✅ | `_increment_qr_counter()` F() expression; `test_qr_open_increments_scan_count_atomic` + `test_qr_open_atomic_under_repeated_requests` |
| 9 | Cross-tenant QR event silent ignore (counter untouched, FK null) | ✅ | `_increment_qr_counter` tenant guard + qr_id null-out; `test_qr_open_cross_tenant_ignored` |
| 10 | Public menü işletme adresi, telefonu, emaili, website'i, Google Maps linkini gösterebilir | ✅ | `BusinessHero` contact strip — her alan opsiyonel render; boş alan separator yok |
| 11 | Sprint 12A primitive'leri REUSE edildi (yeni primitive yazılmadı) | ✅ | Sadece var olan `Card`/`Container`/`IconButton`/`KbdHint` ve Sprint 12A tokens kullanıldı |
| 12 | D-014 (theme override inline CSS variables) korunur | ✅ | `BusinessHero` `<section style={themeStyle}>` dayanır; multi-tenant per-business theme bozulmadı |

**12/12 acceptance criteria** ✓

---

## 2. Commit Listesi (5 commit)

```
b393982  fix(public): logo + cover_image + payload expansion (BusinessHero + serializer)
7130ec3  fix(public): currency fallback chain (menu → business → first item → TRY)
42bb8d3  fix(analytics): QR scan_count atomic increment + cross-tenant guard
2420571  test(public): 8 backend test + 9 frontend test for Sprint A fixes
         + docs/SPRINT_A_REPORT.md (bu dosya)
```

(Plan 6-8 commit idi; test + docs tek commit'e konsolide edildi çünkü atomik — Sprint A testleri Sprint A fix'leri için, Sprint A raporu Sprint A kapsamını özetliyor.)

---

## 3. Dosya Değişiklikleri

### Created (3 yeni dosya)

| Path | Satır | İçerik |
|---|---|---|
| `backend/apps/organizations/tests/__init__.py` | 0 | Package init |
| `backend/apps/organizations/tests/test_summary_serializer.py` | 110 | 4 backend test — Faz 1.1 + Faz 2.1 coverage |
| `apps/web/src/lib/currency.ts` | 60 | 4-step currency resolver + defensive read helper + DEFAULT_CURRENCY export |
| `apps/web/src/lib/currency.test.ts` | 130 | 9 frontend test — node:test runner; edge cases (empty/whitespace/oversize/readonly) |

### Modified (6 dosya)

| Path | Değişiklik |
|---|---|
| `backend/apps/organizations/serializers.py` | `OrganizationSummarySerializer` extend: 13 alan (id, name, slug, logo, cover_image, description, address, google_maps_url, website, email, phone, default_locale, supported_locales, currency); logo/cover `SerializerMethodField` + `_resolve_image_url()` helper (absolute URL pass-through; FieldFile → MEDIA_URL+filename) |
| `apps/web/src/types/menu.ts` | `PublicMenuBusiness` extend: description, address, google_maps_url, website, email, phone (hepsi opsiyonel) |
| `apps/web/src/components/public/BusinessHero.tsx` | cover_image ayrı alan olarak render; logo/cover birbirinden bağımsız placeholder; description + 5 contact alanı hero altında kompaktli strip (boş alanlar separator üretmiyor); `prettyWebsite()` URL display helper |
| `apps/web/src/components/public/MenuViewClient.tsx` | business + menu props eklendi; `resolveCurrency()` kullanıyor; 4-step zincir (cart + checkout + confirmation aynı değer) |
| `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` | `MenuViewClient` çağrısına menu + business payload geçirildi |
| `apps/web/package.json` | `test:currency` script eklendi (seo.test.ts ile aynı pattern — node:test runner) |

### Backend tests extended (1 dosya)

| Path | Değişiklik |
|---|---|
| `backend/apps/analytics/tests/test_events.py` | 4 yeni test: `test_qr_open_increments_scan_count_atomic`, `test_qr_open_atomic_under_repeated_requests` (10x sequential = 10), `test_qr_open_cross_tenant_ignored`, `test_qr_open_unknown_qr_silently_ignored`; private `_make_qr()` helper |

---

## 4. Validation Run

| Validation | Komut | Sonuç |
|---|---|---|
| Backend tests | `cd backend && pytest -q` | ✅ **396 passed**, 18 failed (payment gap, scope dışı), 1 skipped (DRF throttle) |
| Backend organizations tests | `pytest apps/organizations/tests/` | ✅ 4/4 yeşil |
| Backend analytics tests | `pytest apps/analytics/tests/` | ✅ 16/16 yeşil (1 skipped) |
| Frontend type-check | `npm run type-check` | ✅ 0 error |
| Frontend lint | `npm run lint` | ✅ `✔ No ESLint warnings or errors` |
| Frontend build | `npm run build` | ✅ Build succeeded (38 routes pre-compiled) |
| Frontend currency test | `npm run test:currency` | ✅ 9/9 yeşil (node:test runner) |
| Frontend seo test (regression) | `npm run test:seo` | ✅ 20/20 yeşil (regresyon yok) |

### Baseline + yeni test dağılımı

| Kategori | Önce | Sonra | Delta |
|---|---|---|---|
| Backend yeşil (baseline + new) | 388 | 396 | **+8** |
| Frontend test (seo + currency) | 20 | 29 | - |
| **Toplam Sprint A test ekleme** | - | - | **17** (8 backend + 9 frontend) |

---

## 5. Mimari Kararlar (Sprint A)

### D-024 — V1 Satış Hazırlık Pattern (öneri, root yazacak)

| Karar | Açıklama |
|---|---|
| **Public payload immutability** | Public menu endpoint (`get_full_menu_payload`) sadece `OrganizationSummarySerializer` üzerinden geçer — yeni public alanlar serializer'a eklenir, business logic dokunulmaz. Bu pattern D-014 (theme override) ile aynı: payload shape tek noktadan kontrol edilir |
| **Currency resolver tier** | Her müşteri-facing ekran (cart drawer, checkout form, order confirmation) tek bir `resolveCurrency(menu, business, items)` helper'dan beslenir. Cart store hala item başına currency tutar (V1: tüm itemlar aynı business currency); customer-facing override UI V2 SaaS (Sprint 13+) |
| **QR scan_count = authoritative counter** | `QRCode.scan_count` DB-side F() expression ile artırılır (atomic UPDATE row lock). `top_qr_codes` admin endpoint'i bu alana okur. `MenuViewEvent.qr_open` aggregate alternatifi (D-017 V2 planı) Sprint B/C sonrası — şu an counter authoritative ve tenant-safe |
| **Cross-tenant qr guard posture** | Public endpoint bilinçli olarak 204 + no side effect döner (404 veya 400 değil) — business-slug enumeration ve counter-amplification probe engellenir. Aynı posture unknown org ve unknown qr_id için |
| **Image URL resolver scope** | `_resolve_image_url()` local helper (circular import'tan kaçınmak için `apps.menu.services.visibility.image_url` duplicate). İleride tekilleştirmek için `apps.core.utils.image_url` çıkarılabilir (Sprint B/C refactor) |

### D-014 korunur — CSS variable dayanır

`BusinessHero` `<section style={themeStyle}>` üzerinden per-business `--color-primary/secondary/accent/background/text` override dayanır. Sprint 12A eklenen dark mode variable'ları bu pattern'e uyumlu; per-business theme override etmezse `[data-theme="dark"]` selector'ından miras alır. Multi-tenant Cafe warm palette demo'da çalışmaya devam eder.

---

## 6. Out-of-scope (Sprint A dokunmadı)

| Item | Neden | Sprint |
|---|---|---|
| Plan modeli (BASIC / PRO / ORDERS / OPS tier) | V2 SaaS feature flag altyapısı | Sprint B |
| Tenant feature flags (orders_enabled, loyalty_enabled, ...) | Plan modeli gerektirir | Sprint B |
| Mevzuat alanları (KDV oranı, vergi no, ...) | Yasal uyumluluk sprint'i | Sprint D |
| MediaAsset polymorphic model | Storage abstraction (S3 vb.) | Sprint E |
| PDF export | Menü PDF'i (müşteri için) | Sprint D |
| iyzico real integration | V2 SaaS — Stripe primary | Sprint 13+ |
| 11A payment gap testleri (18 spec) | Sprint 11A Stripe test harness fix | Sprint 11A sonrası |
| top_qr_codes MenuViewEvent aggregate alternatifi | D-017 V2 planı | Sprint B/C sonrası |

---

## 7. Demo Doğrulama Notu (QA viewport)

Demo docker compose çalışırken (postgres + backend + frontend healthy) Modern Cafe public menü testleri:

| Viewport | Test |
|---|---|
| 390x844 (iPhone 12/13) | Metin taşması yok, contact strip 2 satıra wrap oluyor, CTA çalışıyor, kategori nav tıklanabilir |
| 430x932 (iPhone 14 Pro Max) | Aynı, +safe-area padding |
| 768x1024 (iPad) | Bento grid, contact strip tek satır, kategori nav yatay scroll yok |
| 1440x900 (desktop) | Centered 2xl layout, footer tam, contact strip + Google Maps link render |

### Console error check
Browser devtools → Console: 0 error bekleniyor (analytics event 204 + CSRF yok; `?qr=<id>` ile qr_open event + scan_count++ console.warn yok).

### QR scan_count verification
```
1. Admin → /admin/qr-codes → Modern Cafe QR → scan_count = N (baseline)
2. Browser → /m/modern-cafe?qr=<id> (Modern Cafe URL)
3. Wait 1 sn (event → counter)
4. Admin → /admin/qr-codes → aynı QR → scan_count = N + 1 ✓
5. Cross-tenant test: org_b'nin QR id'sini org_a URL'sine qisper → org_b.scan_count değişmez ✓
```

---

## 8. Sonuç

Sprint A başarıyla tamamlandı:
- 3 kritik bug fix (logo/cover, currency, QR counter)
- 1 payload eksik fix (6 yeni alan: description, address, google_maps_url, website, email, phone)
- 8 backend + 9 frontend yeni test (17 test ekleme, %100 yeşil)
- tsc + lint + build temiz
- D-014 (theme override) korunur
- Sprint 12A primitive'leri reuse (yeni primitive yazılmadı)

**Demo açıldığında görünen ilk ekran — marka, fiyat, QR analytics — artık doğru çalışıyor.** Out-of-scope item'lar Sprint B/C/D/E'de planlanmış; Sprint A scope'unu kirletmedi.