# Sprint D — Mevzuat Uyum + Printable/PDF (Final Rapor)

**Tarih:** 2026-09-29 (~3 saat, 3 alt sprint = D1a + D1b + D2, 9 commit)
**Önceki:** Sprint C ✅ (Self-Serve Onboarding), Sprint B ✅, Sprint A ✅
**Sonraki:** Sprint E (MediaAsset + S3/R2)

## Özet

V1 satışa hazırlık Faz 4 — Türkiye pazarı için mevzuat uyumu + printable/PDF export.

1. **6 mevzuat alanı** — MenuItem'a calories + portion_size + ingredients + legal_notes + contains_alcohol + is_halal
2. **ItemDetailDrawer** — Public menüde ürün tıklandığında drawer açılır, mevzuat badge'leri (kcal, portion, alcohol, halal, ingredients, legal notes) gösterilir
3. **Printable/PDF** — /m/[slug]/print A4 server page + window.print() trigger + kategori başına sayfa kırılma

## Sprint Dağılımı

| Sprint | Commit | Ana Deliverable |
|---|---|---|
| **D1a** — Backend mevzuat | 3 commit (root) | MenuItem 6 alan + migration 0009 + serializer + public payload + admin form + 7 yeşil test |
| **D1b** — Frontend drawer | 5 commit (worker, D1b+D2 birleşik) | ComplianceFields type + ItemDetailDrawer + ItemCard wire-up |
| **D2** — Printable/PDF | 1 commit (worker) | PrintButton + @media print stylesheet + /m/[slug]/print page |
| **Toplam** | **9 commit** | **471 backend yeşil** (464 baseline + 7 D1a) + 4 frontend test suite |

## Mimari Genel Bakış

```
                    ┌─────────────────────────────────────────────────┐
                    │ apps/menu/models.py (D1a)                        │
                    │  MenuItem + 6 mevzuat alanı:                     │
                    │   • calories, portion_size, ingredients         │
                    │   • legal_notes, contains_alcohol, is_halal     │
                    └─────────────────────────────────────────────────┘
                                │                              │
                                ▼                              ▼
                    ┌────────────────────┐       ┌──────────────────────┐
                    │ MenuItemSerializer │       │ get_full_menu_payload│
                    │ (admin + API)      │       │ (public — D-024 reuse)│
                    └────────────────────┘       └──────────────────────┘
                                │                              │
                                ▼                              ▼
                    ┌─────────────────────────────────────────────────┐
                    │ apps/web/ (frontend — D1b + D2)                  │
                    │  ItemDetailDrawer — mevzuat section            │
                    │  ItemCard tap → drawer                          │
                    │  /m/[slug]/print — A4 server page               │
                    │  PrintButton — window.print() trigger            │
                    │  @media print — nav/header/banner hide          │
                    └─────────────────────────────────────────────────┘
```

## V1 Satışa Hazırlık Sprint'leri Durum

| Sprint | Durum | Commit Range |
|---|---|---|
| **A** — Kritik public menü bug fix | ✅ DONE | `b393982..ba3701e` |
| **B** — Plan + Feature Flags + Limits | ✅ DONE | `d41737a..7340c39` |
| **C** — Self-Serve Onboarding | ✅ DONE | `5b8dc8b..7221404` |
| **D1a** — Backend mevzuat | ✅ DONE | `1fd9914..fd40f92` |
| **D1b + D2** — Frontend drawer + print | ✅ DONE | `7030bed..0363e2c` |
| **D** final + D-031 + D-032 | 🔄 IN PROGRESS | bu rapor |
| **E** — MediaAsset + S3/R2 | ⏳ PENDING | — |

## Endpoint / Field Inventory (Sprint D eklemeleri)

### Public menu payload (Sprint D1a — D-024 reuse pattern)
- `calories` (PositiveIntegerField, nullable) — kcal
- `portion_size` (CharField max_length=60) — "250g"
- `ingredients` (TextField) — "domates, peynir, un"
- `legal_notes` (TextField) — alerjen uyarıları
- `contains_alcohol` (BooleanField) — vergi/yasal
- `is_halal` (BooleanField, nullable 3-state) — None/True/False

### Admin form fieldsets (D1a)
- "Mevzuat Bilgileri (Türk Gıda Kodeksi)" fieldset — 6 alan + help_text

### Public pages (D1b + D2)
- `/m/<slug>` — ItemDetailDrawer integration (item card tap)
- `/m/<slug>/print` — A4 server page (noindex, bookmarklanabilir)

## Frontend Architecture (Sprint D)

### Yeni Dosyalar (D1b + D2)

| Dosya | Sorumluluk |
|---|---|
| `apps/web/src/components/public/ItemDetailDrawer.tsx` | Slide-in drawer + mevzuat section |
| `apps/web/src/components/public/PrintButton.tsx` | window.print() trigger (desktop only) |
| `apps/web/src/app/(public)/m/[businessSlug]/print/page.tsx` | A4 server page |
| `apps/web/src/styles/print.css` | @media print global styles |
| `apps/web/src/types/menu.ts` | MenuItem + ComplianceFields type |

### Modified Components

- `apps/web/src/components/public/ItemCard.tsx` — title-as-tap-target (mobile-friendly) + drawer wire
- `apps/web/src/components/public/MenuViewClient.tsx` — PrintButton mount (≥ md)
- `apps/web/src/app/globals.css` — print.css import

## Test Durumu

### Backend
- **471 yeşil** (464 baseline + 7 D1a compliance)
- 18 payment spec gap pre-existing (Sprint 11B scope)
- D1a test breakdown: 1 default blank + 1 persist round-trip + 1 is_halal 3-state + 1 alcohol + 1 serializer round-trip + 1 public payload includes + 1 public payload nullable

### Frontend
- `npm run type-check` → 0 error
- `npm run lint` → 0 warning
- `npm run build` → 30+ route başarılı, `/m/[businessSlug]/print` 187 B, `/m/[businessSlug]` 26.7 kB
- 4 frontend test suite yeşil (seo, currency, feature-flags, trial-banner)

## Demo Flow

### Public Item Drawer (Mevzuat)

```bash
# Demo'da Modern Cafe OPS → /m/modern-cafe
# Ürün kartına tıkla (chevron veya title)
# ItemDetailDrawer slide-up:
#   - Hero: name + image + price
#   - Description + allergens + dietary_tags
#   - Mevzuat section:
#     🔥 350 kcal  📏 250g  Helal  🍷 Alkol içerir
#     İçindekiler: [domates] [peynir] [un] [zeytinyağı]
#     Yasal not: "Buğday, süt, yumurta içerir."
# ESC veya backdrop → kapat
```

### Print Flow (Sprint D2)

```bash
# /m/modern-cafe → header sağında "🖨️ Yazdır" pill
# Tıkla → window.print() → tarayıcı print dialog
# Print preview: A4 portrait
#   - Header: business name + logo + cover + adres + tel
#   - Her kategori yeni sayfa (break-before: page)
#   - Item row: name + price + mevzuat chips
#   - Footer: timestamp
# Save as PDF → tarayıcı PDF export
```

## Karar Geçmişi

- **D-024** (Sprint A) — V1 Satış Hazırlık Critical Fixes (public payload 12→18)
- **D-025** (Sprint 10A) — Müşteri Auth + Sadakat
- **D-026** (Sprint 11A) — Online Ödeme
- **D-027** (Sprint 12A) — UI/UX Design System
- **D-028** (Sprint B1) — Plan + Feature Flags + Limits
- **D-029** (Sprint B3) — Public Feature Flag Reader
- **D-030** (Sprint C) — Self-Serve Onboarding
- **D-031** (Sprint D1) — Türk Gıda Kodeksi Mevzuat Uyum Pattern
- **D-032** (Sprint D2) — Printable/PDF Menü Export Pattern

## Out-of-Scope (V2 SaaS)

- Gıda etiket mevzuatı compliance certification
- Allergens EU 14 standard list mapping
- Otomatik kalori hesaplama (AI vision)
- Multi-page brochure layout
- Barkod/QR product lookup
- PDF binary backend endpoint (V1 HTML print yeterli)
- Mobile print preview (V1 desktop-only)
- Stripe TR lisans yönetimi
- PayTR/Param entegrasyonu

## Bilinen Trade-off'lar (V1 Demo)

1. **Modern Cafe mevzuat alanları boş** — Sprint D3'te seed update skip edildi (25 ürün × 6 alan = çok büyük değişiklik). Sprint E polish'te eklenebilir
2. **PDF binary backend endpoint YOK** — V1 HTML print yeterli, kullanıcı tarayıcı PDF export eder. Sprint E'de WeasyPrint backend eklenebilir
3. **Mobile print UX zayıf** — PrintButton desktop-only. V1 demo kabul edilebilir
4. **Backend 18 payment spec gap** — Pre-existing Sprint 11B scope, dokunulmadı
5. **Admin form save HTTP test'i skip** — Sprint D1a'da service test yeterli, HTTP test Sprint E polish'te eklenebilir

## Sprint D Sonuçları

- ✅ 9 commit (D1a: 3 backend + D1b+D2: 6 frontend) — 0 regresyon
- ✅ 471 backend yeşil (464 baseline + 7 D1a)
- ✅ Frontend tsc/lint/build temiz + 4 test suite yeşil
- ✅ Public menüde mevzuat drawer (calories, portion, alcohol, halal, ingredients, legal notes)
- ✅ Print page + PrintButton (HTML print)
- ✅ 6 yeni alan MenuItem modelinde (migration backward-compatible)
- ✅ Admin form fieldsets ile operator UX kolaylaştırıldı

**Sonraki sprint:** Sprint E — MediaAsset + S3/R2 (Faz 5) → MediaAsset modeli + R2/S3 storage + production media QA.

V1 demo satışa hazır duruma gelmesi için Sprint E (~2-3 sprint) gerek.
