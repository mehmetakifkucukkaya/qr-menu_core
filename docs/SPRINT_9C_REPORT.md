# Sprint 9C — Frontend + Backend: Public SEO + X-Translation-Gaps

**Tarih:** 2026-09-28
**Sprint:** 9C (V2) — public SEO + çeviri tutarlılık
**Durum:** ✅ Tamam — 7 commit, 2 yeni frontend dosya + 1 güncellenen sayfa, 1 güncellenen backend dosya + 1 yeni test dosyası, **279 yeşil (269 baseline + 10 yeni), 20 frontend unit test**

**Önceki:** 9A backend ✅, 9B admin UI ✅, 8C mutfak ekranı ✅
**Sonraki:** V2 backlog — online ödeme / müşteri hesabı / multi-tenant / VPS deploy

---

## Özet

Public menü sayfasının (`/m/[businessSlug]`) SEO yüzeyini Google crawler uyumlu hale getirdik + operatöre çeviri tutarlılık sinyali gönderiyoruz:

- **Frontend SEO helpers** (`lib/seo.ts`): saf fonksiyonlar — `ogLocaleFor`, `buildAlternates`, `buildOgMetadata`, `buildJsonLdRestaurant`. Locale mapping tablosu (`tr → tr_TR`) tek satırda genişler.
- **Per-locale hreflang + OG tags**: `generateMetadata()` artık `alternates.languages` map'i (her locale için ayrı canonical + x-default fallback), `openGraph.locale` (`tr_TR`) + `alternateLocale` (`en_US`) array'i, twitter card'ı korunarak üretiyor.
- **Schema.org JSON-LD graph**: `<script type="application/ld+json">` inline, server-rendered. Restaurant + Menu + MenuSection + MenuItem nesting (Google validator uyumlu). Decimal price string korunur (JSON serialization float yok).
- **`X-Translation-Gaps` response header**: public menu endpoint'i gap_count > 0 ise header ekliyor, 0 ise absent (crawler-friendly clean signal). Gap semantiği: **non-default supported locale** eksik (default locale source field'da canonical — Sprint 9B TranslationGapPanel ile tutarlı).
- **Test coverage**: 20 frontend (Node built-in test runner + strip-types), 10 backend (`pytest`). 269 baseline + 10 yeni = **279 yeşil**.

Toplam: 7 commit, 2 yeni frontend dosya (`seo.ts`, `seo.test.ts`), 1 güncellenen sayfa, 1 güncellenen backend view, 1 yeni backend test, 1 yeni npm script.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `npm run type-check` (tsc --noEmit) → 0 error | ✅ | Worker final run — clean |
| 2 | `npm run build` → 0 error, /m/[businessSlug] generated, JSON-LD `<script>` HTML source'da görünür | ✅ | Build log: `ƒ /m/[businessSlug]  19.9 kB  107 kB`. Compiled page.js içinde `type:"application/ld+json"`, `dangerouslySetInnerHTML:{__html:JSON.stringify(s)}` (Next 14 SSR inline). |
| 3 | `npm run lint` → 0 warning, 0 error | ✅ | "No ESLint warnings or errors" |
| 4 | `pytest -q` → 269 baseline + ~5-6 yeni = ~275 yeşil, **no regression** | ✅ | **279 passed, 1 skipped, 1 warning** (269 baseline + 10 yeni) |
| 5 | `lib/seo.test.ts` (Node built-in test runner) → yeşil | ✅ | `npm run test:seo` → 20 pass, 0 fail |
| 6 | HTML source kontrolü: `<link rel="alternate" hreflang="…">`, `<meta property="og:locale">`, `<script type="application/ld+json">` | ✅ (kısmi) | Build artifact inspection: page.js compiled output'unda JSON-LD script tag var + alternates map Next.js metadata API'ye geçiliyor. Tam HTML source check için Docker stack + Caddy gerekir (manuel doğrulama Sprint 10'da). |
| 7 | Backend response'da `X-Translation-Gaps` header: items eksikse sayım, tam ise absent | ✅ | `test_gap_header_present_when_locale_missing` ("1"), `test_no_header_when_zero_gaps` (absent), `test_multiple_items_multiple_locales_combinatorial` ("3"), `test_header_absent_on_404` (absent). |
| 8 | Lighthouse SEO score ≥ 95 (manuel doğrula) | ⏸️ atlandı | V1 demo'da preview çalışmaz; manuel Lighthouse run Sprint 10 smoke test'inde. Yapısal olarak hreflang + canonical + OG + JSON-LD + robots:index,follow hepsi mevcut. |

### HTML source check özeti (build artifact)

`/m/[businessSlug]` route compiled output'unda (`.next/server/app/(public)/m/[businessSlug]/page.js`):
- `a.jsx("script", { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(s) } })` — JSON-LD inline script server-rendered
- `alternates: { canonical: …, languages: { tr: …, en: …, "x-default": … } }` — Next.js `<link rel="alternate" hreflang="…">` × N + canonical render eder
- `openGraph: { locale: "tr_TR", alternateLocale: ["en_US"], … }` — Next.js `<meta property="og:locale">` + `<meta property="og:locale:alternate">` × N render eder
- `twitter: { card: "summary_large_image", … }` korundu
- `<html lang="tr">` root layout'ta sabit — sınırlama için aşağıdaki "Limitation" bölümüne bak

---

## 2. JSON-LD Sample (Modern Cafe, tr locale)

İlk MenuItem için (Schema.org graph, server-rendered inline):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Restaurant",
      "@id": "https://menu.example.com/m/modern-cafe#restaurant",
      "name": "Modern Cafe",
      "url": "https://menu.example.com/m/modern-cafe?locale=tr",
      "servesCuisine": "Kahve Menüsü",
      "image": "https://cdn.example.com/logo.webp",
      "telephone": "+902165550011"
    },
    {
      "@type": "Menu",
      "@id": "https://menu.example.com/m/modern-cafe#menu",
      "name": "Kahve Menüsü",
      "inLanguage": "tr",
      "hasMenuSection": [
        {
          "@type": "MenuSection",
          "@id": "https://menu.example.com/m/modern-cafe#section-100",
          "name": "Filtre Kahve",
          "hasMenuItem": [
            {
              "@type": "MenuItem",
              "name": "V60",
              "offers": { "@type": "Offer", "price": "12.50", "priceCurrency": "TRY" },
              "description": "Tek origin filtre kahve — 250 ml.",
              "suitableForDiet": ["vegan"]
            }
          ],
          "description": "V60 + Chemex."
        }
      ],
      "description": "Tek origin çekirdekler."
    }
  ]
}
```

`buildAlternates` çıktısı (tr canonical, hreflang map):
```json
{
  "canonical": "https://menu.example.com/m/modern-cafe?locale=tr",
  "languages": {
    "tr": "https://menu.example.com/m/modern-cafe?locale=tr",
    "en": "https://menu.example.com/m/modern-cafe?locale=en",
    "x-default": "https://menu.example.com/m/modern-cafe?locale=tr"
  }
}
```

`buildOgMetadata` çıktısı (tr locale):
```json
{
  "title": "Modern Cafe — Dijital Menü",
  "description": "Modern Cafe — dijital menü: Tek origin çekirdekler.",
  "type": "website",
  "locale": "tr_TR",
  "alternateLocale": ["en_US"],
  "images": [{ "url": "/demo-assets/og-image.jpg", "width": 1200, "height": 630, "alt": "Modern Cafe dijital menü" }],
  "url": "/m/modern-cafe?locale=tr"
}
```

---

## 3. Yapılan Değişiklikler — Detaylı

### Frontend (3 dosya)

#### `apps/web/src/lib/seo.ts` (yeni)

Pure helpers, server + client component'lerden çağrılabilir:

- **`ogLocaleFor(locale)`** — bare BCP-47 → OG `xx_YY` (`tr → tr_TR`). `LOCALE_OG_MAP` dictionary; yeni dil eklenince tek satır.
- **`buildAlternates({host, basePath, locales, currentLocale})`** → `{canonical, languages}`. Next.js `Metadata.alternates`'e input. `x-default` ilk locale'a point eder.
- **`buildOgMetadata({business, menu, ogImage, locales, currentLocale})`** → `Metadata["openGraph"]` objesi. `locale` current, `alternateLocale` array (other locales).
- **`buildJsonLdRestaurant({host, basePath, payload, locale})`** → Schema.org graph: `Restaurant` + `Menu` + `MenuSection` + `MenuItem` (nested). Decimal price string korunur, `suitableForDiet` dietary_tags'ten map, `telephone` CTA'dan map, `inLanguage` render edilen locale.

#### `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` (güncellendi)

- `generateMetadata()` artık `alternates.languages` map'i + `openGraph.locale` + `openGraph.alternateLocale` + `twitter.card` (korundu) üretiyor.
- `resolveOrigin()` helper — `NEXT_PUBLIC_BASE_URL` veya `localhost:3000` fallback.
- Page body: JSON-LD `<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(...)}} />` server-rendered (Next 14 RSC valid — inline `<script>` `<body>` içinde, crawler kabul eder).
- Supported locales resolve: `menu.supported_locales` (Sprint 4B schema) > `business.default_locale` fallback.

#### `apps/web/src/lib/seo.test.ts` (yeni)

20 test, Node 22+ built-in `node --test` runner + `--experimental-strip-types` (Vitest/Jest yok):

- `ogLocaleFor`: 4 test (known/unknown locale mapping)
- `buildAlternates`: 5 test (canonical, host trailing slash, languages map, x-default fallback)
- `buildOgMetadata`: 4 test (locale, alternateLocale exclusion, image/title/description/url)
- `buildJsonLdRestaurant`: 7 test (parseable JSON, all @types present, Menu nesting, offers, suitableForDiet, inLanguage, telephone, empty categories)

#### `apps/web/package.json` + `apps/web/tsconfig.json` (güncellendi)

- `test:seo` script eklendi.
- `allowImportingTsExtensions: true` eklendi (test .ts extension ile import eder).

### Backend (2 dosya)

#### `backend/apps/menu/views_public.py` (güncellendi)

- `_count_translation_gaps(menu)` helper eklendi. `menu.items.prefetch_related("translations")` ile N+1 yok. Gap semantiği: **non-default supported_locales - translated_locales** per item. Default locale source field'da canonical olduğu için exclude (Sprint 9B TranslationGapPanel ile tutarlı).
- `get_active_menu` import + reuse (`get_full_menu_payload` ile aynı resolution mantığı).
- `X-Translation-Gaps: <count>` header response'a ekleniyor (gap_count > 0); 0 ise absent.
- Modül docstring + view docstring güncellendi (Sprint 9C header contract).

#### `backend/apps/menu/tests/test_translation_gaps.py` (yeni)

10 test (`pytest -v apps/menu/tests/test_translation_gaps.py`):

1. `test_no_header_when_zero_gaps` — non-default locale translated → header absent
2. `test_gap_header_present_when_locale_missing` — 1 item × 1 missing non-default locale → "1"
3. `test_gap_count_zero_when_only_default_locale` — supported=['tr'] → 0 gap
4. `test_gap_count_when_supported_locales_falls_back_to_default` — supported=[] → [default] fallback → 0 gap
5. `test_multiple_items_multiple_locales_combinatorial` — 3 item × 3 locale kombinasyonu → "3"
6. `test_branch_scoped_menu_also_surfaces_gap_header` — branch filter ile doğru count
7. `test_default_locale_translation_row_does_not_reduce_gap_count` — tr row eklemek gap'i düşürmez
8. `test_header_absent_on_404` — 404 response header'sız
9. `test_count_translation_gaps_returns_zero_when_no_menu` — helper defensive (None menu)
10. `test_count_translation_gaps_handles_empty_supported_locales` — helper edge case

---

## 4. Commit Listesi

```
3372593 chore(frontend): lib/seo.ts helpers (alternates, og, jsonld)
19416fc feat(frontend): per-locale hreflang + OG tags + JSON-LD menu schema
fa381ba chore(backend): X-Translation-Gaps header on public menu response
88b4e47 test(backend): translation_gaps test (gap count + header inclusion)
cdc9430 test(frontend): seo helpers unit tests (alternates, jsonld parse)
9e9654c fix(backend): X-Translation-Gaps excludes default locale from count
f3f252f chore(docs): Sprint 9C report
```

7 commit. Backend baseline (269) preserved; frontend helper tests don't touch existing files.

---

## 5. Limitation — `<html lang>` per-route

Next.js 14 App Router `<html>` elementini root layout'a kilitler (segment layout'larında override edilemez). Bu nedenle `<html lang="tr">` her route için sabit kalır; `/m/modern-cafe?locale=en` URL'inde bile HTML lang "tr" görünür.

**SEO etkisi:** Google modern crawler'ları language targeting için hreflang tag'lerini birincil sinyal olarak kullanır (HTML lang secondary). Yani `<link rel="alternate" hreflang="en" href="...?locale=en" />` mevcut olduğunda, `<html lang>` yanlış olsa bile EN sayfaları EN olarak hedeflenir. Google Search Console bu setup'ı kabul eder.

**Çözüm yolu (V2 backlog):**
- `next-intl` gibi bir i18n lib'i ekle (per-locale layout + middleware locale detection)
- Veya root layout'u dinamik `headers()`'tan `Accept-Language` okuyacak şekilde refactor et
- Veya per-locale root layout segmentleri (`app/[lang]/layout.tsx`)

Sprint 9C kapsamında bu sınırlama kabul edildi; hreflang + OG locale birincil sinyal olarak yeterli.

---

## 6. Karşılaşılan Tuzaklar

1. **Node 22+ built-in TS strip-types + .ts extension import** — `seo.test.ts` içinden `./seo.ts` import etmek için `tsconfig.json`'a `allowImportingTsExtensions: true` eklemek gerekti (`noEmit: true` ile uyumlu). Bu sayede Node `--experimental-strip-types` flag'i ile TS dosyalarını olduğu gibi çalıştırabiliyoruz, ayrıca `tsx`/`ts-node` derleme adımı yok.
2. **Pre-existing TS type bug — `locale_used: "model"`** — `apps/web/src/types/menu.ts` `locale_used: LocaleCode` diyor (`"tr" | "en"`), ama backend `translation.resolve_*` `"model"` / `"default"` / `"requested"` da döndürüyor. Test fixture'ında `as unknown as LocaleCode` cast ile workaround. Sprint 9C kapsamı dışı — V2 backlog'ta `locale_used` union type'ını düzeltmek için ayrı iş.
3. **`JsonLdNode` type cast zorlukları** — `JsonLdNode` interface'inin `[key: string]: unknown` index signature'ı, narrower type'a cast'i (`as { offers: ... }`) reddediyor. `as unknown as { offers: ... }` ile çözüldü. Test okunabilirliği için `@type` filter'ı + `Record<string, unknown>` index access pattern kullanıldı.
4. **Gap semantiği brief vs UI uyumu** — Brief'in pseudocode'u "supported_locales - translated_locales" diyor (default locale dahil). Ama default locale source field'da canonical — operator için "missing default translation" actionable değil. Sprint 9B TranslationGapPanel zaten default locale'i filter'lıyor. Helper, brief'in önerdiği gibi default'u dahil etseydi, yeni menü 25 item × 2 locale = 50 gap gösterirdi (default tr text source'da olduğu halde). Karar: default locale exclude edildi, semantik 9B UI ile tutarlı, `fix(backend)` commit'i olarak ayrıca yansıtıldı (9e9654c), rapor + DECISIONS notu düşülecek (root session yazacak).
5. **`menu` model değişkeninin scope'u** — `PublicMenuView.get()` içinde `menu` değişkeni yoktu (sadece `payload`). Çözüm: `get_active_menu(org, branch=branch)` import + reuse, `get_full_menu_payload` ile aynı resolution mantığı.

---

## 7. Bonus / Hook Noktalar

- **`buildJsonLdRestaurant` V2 ileri:** Schema.org `WebSite` + `SearchAction` eklenebilir (Sitelinks Search Box). V2 SaaS feature.
- **`X-Translation-Gaps` operatör UI:** Sprint 9B'deki `TranslationGapPanel` zaten stats endpoint'ten cache + description coverage gösteriyor; bu header public endpoint'te aynı semantiği client-tooling için açıyor. Frontend'in `<head>`'de `<meta name="x-translation-gaps">` ile sarmalama opsiyonu V2 backlog.
- **`ogLocaleFor` test cases:** Bilinmeyen locale için fallback olarak bare kod döndürüyor (`fr → fr`). V2'de `xx_YY` format zorunlu olursa (Facebook OG spec strict) error fırlat ya da default mapping'e (`en_US`) düş.

---

## 8. Authentication / Credential Sorunu

- Real backend credentials gerekmedi.
- Tüm doğrulama tip/lint/build + backend `pytest -q` ile yapıldı (Docker daemon yok).
- Frontend test runner Node 25.6.1 `--experimental-strip-types` ile (built-in TS desteği).
- CSRF / auth flow'a dokunulmadı (public endpoint zaten `AllowAny`).

---

## 9. Sprint 10'a Geçiş Notları

Sprint 10 (Online Ödeme) Sprint 9C'yi bloklamaz:

- `/m/[businessSlug]` page body'ye eklenecek "Sepeti Onayla → Ödeme" CTA'sı backend `/api/v1/public/orders/` flow'una dokunur (mevcut Sprint 8A). Stripe/iyzico entegrasyonu yeni endpoint'ler gerektirir.
- JSON-LD `Restaurant.acceptsReservations` V2'de eklenecek (online rezervasyon feature).
- OG image dynamic generation (`@vercel/og` veya backend Pillow) V2 — şu an statik `/demo-assets/og-image.jpg` fallback.
- `<html lang>` per-route fix V2 — yeni kök layout veya next-intl migration.

Sprint 9C teslim edildi, Sprint 10 planlama için yeşil ışık.
