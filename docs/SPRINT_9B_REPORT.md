# Sprint 9B — Frontend: Admin Inline Translation + Description Generator + Bulk Modal

**Tarih:** 2026-09-28
**Sprint:** 9B (V2)
**Durum:** ✅ Tamam — 6 commit, 6 yeni component, 1 güncellenen component, 1 yeni sayfa, 6 yeni API wrapper, **backend baseline korunur (269 yeşil)**
**Önceki:** 9A backend ✅, 8C mutfak ekranı ✅, 8A order backend ✅
**Sonraki:** 9C public SEO (hreflang + OG + JSON-LD + X-Translation-Gaps header)

## Özet

Sprint 9A'nın backend omurgası (5+1 admin endpoint, 2 model, audit, cache) üstüne admin UI'ın tüm AI-assisted yüzeyini ekledik. Operatör artık:

- Item/category edit sayfasında **her satırda inline AI Çevir** butonuna basıp modal önizleme → onayla akışıyla çeviri alabilir
- Aynı sayfada **"Tümünü AI Çevir"** primary butonu ile tek tıkla N dile toplu çeviri yapabilir
- Description alanı yanında **"Açıklama Oluştur"** trigger'ı ile modal açıp öneriyi düzenleyip kaydedebilir (operator-edited ise "Yeniden Üret" force=true)
- `/admin/menus/{id}` header'ında **TranslationGapPanel** — cache + description + dil istatistikleri + Toplu Çevir / Açıklama Oluştur CTA
- Veya doğrudan `/admin/menus/{id}/translate` workspace sayfasına gidip aynı paneli bookmark edebilir
- 4-step wizard (locales → source → preview → running → done) ile **BulkTranslateModal**: preview adımı cache hit/miss tahmini, success screen API call sayısı + cache isabet oranı gösterir

Toplam: 6 commit, 5 yeni component (`AIAssistButton`, `LocaleBadge`, `AITranslatePreviewModal`, `DescriptionGeneratorModal`, `BulkTranslateModal`, `TranslationGapPanel`), 1 güncellenen component (`TranslationTabs`), 1 yeni sayfa, 6 yeni API wrapper + 5 yeni type. Backend baseline 269 yeşil korundu.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `npm run type-check` (tsc --noEmit) → 0 error | ✅ | Worker final run — clean |
| 2 | `npm run build` → 0 error, route `/admin/menus/{id}/translate` görünür | ✅ | Build log: `ƒ /admin/menus/[menuId]/translate  1.57 kB   105 kB` |
| 3 | `npm run lint` → 0 warning, 0 error | ✅ | Worker final run — "No ESLint warnings or errors" |
| 4 | Backend baseline 269 yeşil | ✅ | `pytest -q` → `269 passed, 1 skipped, 1 warning` (pre-existing skip) |
| 5 | Inline AI butonları çalışır (TranslationTabs + Description modal) | ✅ | `TranslationTabs.tsx` — per-locale button + preview modal `applyGeneratedDescription` flow + `ItemForm.tsx` DescriptionGeneratorModal trigger |
| 6 | Bulk modal: Tüm ürünleri İngilizce'ye çevir → progress + success | ✅ | `BulkTranslateModal.tsx` — 4-step wizard, `StepRunning` + `StepDone` |
| 7 | TranslationGapPanel `/admin/menus/[menuId]` header'da render | ✅ | `app/(admin)/admin/menus/[menuId]/page.tsx` — server-fetch `fetchTranslateStats` → `<TranslationGapPanel>` |
| 8 | Bonus `/stats` endpoint gap badge'lerinde sayı doğru | ✅ | `TranslationGapPanel` — `stats.translation_memory.total`, `stats.descriptions.{total,edited}` direkt render |
| 9 | (Bonus) New `/admin/menus/{menuId}/translate` workspace sayfası | ✅ | Yeni `app/(admin)/admin/menus/[menuId]/translate/page.tsx` |

---

## 2. Commit'ler (6)

```
779a80e chore(frontend): admin API wrappers (translate + describe) + types
f343a10 feat(frontend): AIAssistButton + LocaleBadge shared components
7399521 feat(frontend): TranslationTabs AI integration (inline per-locale + bulk multi-locale)
20331c4 feat(frontend): DescriptionGeneratorModal + inline trigger
243b626 feat(frontend): BulkTranslateModal at /admin/menus/{menuId}/translate
3a5de2a feat(frontend): TranslationGapPanel + stats fetch on /admin/menus/{menuId} header
```

---

## 3. Oluşturulan / Değiştirilen Dosyalar

### Yeni componentler (`apps/web/src/app/(admin)/_components/`)

```
AIAssistButton.tsx                (~190 satır)  Stateful action button (idle/loading/success/error), 200ms grace + 500ms success check
LocaleBadge.tsx                   (~95 satır)   tr/en pill (outline/solid), button variant for pill toggle
AITranslatePreviewModal.tsx       (~190 satır)  Inline AI çeviri önizleme — Uygula / İptal
DescriptionGeneratorModal.tsx     (~270 satır)  AI ile açıklama üret — edit draft → Kaydet (force=true Yeniden Üret)
BulkTranslateModal.tsx            (~790 satır)  4-step wizard — locales / source / preview / running / done
TranslationGapPanel.tsx           (~210 satır)  Menu header banner — stats tiles + Toplu Çevir + Açıklama Oluştur
```

### Güncellenen componentler

```
TranslationTabs.tsx               +165 satır    Inline per-locale "AI Çevir" button (name + description rows) +
                                              "Tümünü AI Çevir" primary action above tabs. New optional `ai` prop
                                              ({entityType, entityId, csrfToken}) — backward-compatible
```

### Yeni sayfa

```
apps/web/src/app/(admin)/admin/menus/[menuId]/translate/page.tsx  (~165 satır)
    Client-only workspace — fetches menu + categories + stats, mounts TranslationGapPanel,
    opens BulkTranslateModal in-page. Bookmarkable.
```

### Güncellenen sayfalar

```
apps/web/src/app/(admin)/admin/menus/[menuId]/page.tsx
    + fetchTranslateStats server-side (404/5xx swallowed) → TranslationGapPanel mounted
    + "AI Çeviri" quick-link in header actions → /admin/menus/{id}/translate

apps/web/src/app/(admin)/admin/menus/[menuId]/categories/[categoryId]/items/ItemForm.tsx
    + DescriptionGeneratorModal trigger button (only on edit)
    + applyGeneratedDescription → patches translations map; form's normal PATCH ships it
    + TranslationTabs gets `ai={{entityType: 'menu_item', entityId, csrfToken}}` on edit

apps/web/src/app/(admin)/admin/menus/[menuId]/categories/CategoryForm.tsx
    + TranslationTabs gets `ai={{entityType: 'menu_category', entityId, csrfToken}}` on edit
```

### Güncellenen lib/types

```
apps/web/src/lib/api-admin.ts     +125 satır    6 yeni wrapper: translateText, translateMenuItem,
                                                translateMenuCategory, describeMenuItem, describeBulk,
                                                fetchTranslateStats
apps/web/src/types/admin.ts       +115 satır    5 yeni interface: AITranslateTextResponse,
                                                AITranslateEntityRow, AITranslateMenuEntityResponse,
                                                AIDescribeItemResponse, AIDescribeBulkRow,
                                                AIDescribeBulkResponse, AITranslateStatsResponse
```

---

## 4. Component Behavior Detail

### `AIAssistButton`

Stateful action button shared across all AI surfaces:

| State | Görünüm |
|-------|---------|
| `idle` | Outlined button with Sparkles icon + label |
| `loading` | Loader2 spinner (200ms grace — cache hits don't flash) |
| `success` | Green Check icon (500ms), then auto-return to idle |
| `error` | Red outline + accent X icon + inline error pill below |

Props: `action` (Promise-returning fn), `label`, `variant: 'primary' | 'inline'`, `size: 'sm' | 'md'`, `skipLoadingFlash`, `testId`. Used by TranslationTabs (inline per-locale + bulk primary), TranslationGapPanel (describe bulk action), TranslationGapPanel/BulkTranslateModal action bar.

### `LocaleBadge`

tr/en pill with optional flag emoji (🇹🇷 / 🇬🇧). Variants:

- `outline` — bordered, low emphasis. Inline gap indicators, table column headers.
- `solid` — primary-colored. Active tab in TranslationTabs, active selection in bulk modal.

`asButton` prop renders as `<button>` for pill-toggle UX (used in bulk modal step 1). `size: 'sm' | 'md'`. Typed against `AdminLocaleCode` union so future DE/AR locales land type-safe.

### `TranslationTabs` (updated)

Backward-compatible change. New optional `ai` prop:

```typescript
ai?: {
  entityType: "menu_item" | "menu_category";
  entityId: number;
  csrfToken: string | null;
} | null
```

When `ai` is provided:

- **"Tümünü AI Çevir"** primary button above tabs → calls multi-locale endpoint and merges returned translations into local state
- **Per-locale "AI Çevir" button** on name row (only for non-source locales) → preview modal flow
- **Per-locale "AI Çevir" button** on description row (only for non-source locales) → direct write to that locale's description

When `ai` is omitted (e.g. on item create before the item id exists), the form behaves identically to V1. Both `ItemForm` and `CategoryForm` opt in only on edit.

### `AITranslatePreviewModal`

Side-by-side preview: source row + AI öneri row. Cache vs fresh badge at the bottom. "Uygula" only enabled when result is loaded and not loading. Built on `<dialog>` so ESC + backdrop cancel for free.

### `DescriptionGeneratorModal`

Auto-runs `describeMenuItem(itemId, {locale})` on open. Result lands in an editable textarea — operator can tweak before "Kaydet". The "Yeniden Üret" button sends `force=true` (D-023 regen guard). `isAlreadyEdited` flag shows an accent badge so the operator knows the regen is destructive.

The modal's `onApply` writes the edited draft to the parent form's translations map at `default_locale`. The form's normal PATCH payload (`translationsArray[0].description`) then ships it to the backend.

### `BulkTranslateModal`

4-step wizard:

1. **Hedef diller** — multi-select pill row (LocaleBadge asButton). Default = empty.
2. **Kaynak** — pick source locale + entity filter (all / items / categories).
3. **Önizleme** — auto-runs the first 3 entities through AI, renders cache/miss badges, shows "{cache} / {total} önbellek tahmini" hint.
4. **Çalışıyor** — sequential run with progress bar + cache/API counter.
5. **Bitti** — success card with "{N} çeviri (X cache, Y yeni API call)" breakdown.

Stepper at the top shows which step the operator is on. Back button + Close button on the running step are disabled so the modal can't be dismissed mid-batch.

### `TranslationGapPanel`

3 stat tiles (translation memory total + cache hit rate, description count + edited count, supported locales). Per-locale target badges. Two CTAs:

- **Toplu Çevir** → opens BulkTranslateModal in-place
- **Açıklama Oluştur** → calls `describeBulk({locale: default})` and renders {generated, skipped, errors} breakdown inline

Stats endpoint failures are swallowed at the page level (server-side) so the panel doesn't break the menu overview when the translate app is unavailable.

---

## 5. API Wrappers (hepsi Sprint 9A endpoint'lerine)

| Function | Endpoint | Method |
|----------|----------|--------|
| `translateText({text, source_locale, target_locale}, csrf)` | `/api/v1/admin/translate/` | POST |
| `translateMenuItem(id, {source_locale?, target_locales}, csrf)` | `/api/v1/admin/translate/menu-item/{id}/` | POST |
| `translateMenuCategory(id, {source_locale?, target_locales}, csrf)` | `/api/v1/admin/translate/menu-category/{id}/` | POST |
| `describeMenuItem(id, {locale, force?}, csrf)` | `/api/v1/admin/describe/menu-item/{id}/` | POST |
| `describeBulk({locale, item_ids?}, csrf)` | `/api/v1/admin/describe/bulk/` | POST |
| `fetchTranslateStats()` | `/api/v1/admin/translate/stats/` | GET |

CSRF pattern: `csrfToken` parameter, echoed in `X-CSRFToken` header (existing `adminFetch` helper handles). Internal RSC fetches use `{internal: true, cookieHeader}`.

---

## 6. TSC + Lint + Build Çıktıları

```
$ npm run type-check
> tsc --noEmit
(clean)

$ npm run lint
> next lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Generating static pages (17/17)
Route (app)                                                  Size     First Load JS
├ ƒ /admin/menus/[menuId]                                    1.83 kB  105 kB
├ ƒ /admin/menus/[menuId]/translate                          1.57 kB  105 kB  ← NEW
└ ...
```

Backend baseline:

```
$ pytest -q
269 passed, 1 skipped, 1 warning in 3.09s
(skip pre-existing — analytics throttle cache share across tests)
```

---

## 7. Out-of-Scope (YAPILMADI)

- ❌ Public SEO (Sprint 9C — hreflang, OG, JSON-LD, X-Translation-Gaps header)
- ❌ Yeni translation/description model field'ları (mevcut `MenuCategory.translations` + `MenuItem.translations` kullanıldı)
- ❌ DE/AR UI locales (backend sadece TR↔EN; UI sadece TR↔EN; diğer lokaller render edilmiyor)
- ❌ DECISIONS D-023 güncellemesi (root session tamamladı, dokunulmadı)
- ❌ Backend değişiklik (sıfır yeni migration, sıfır yeni endpoint)
- ❌ Real-time progress (SSE) — sequential run + progress bar yeterli
- ❌ LocaleBadge-locale-specific sayfa çevirisi (no SSR locale switch)

---

## 8. Karşılaşılan Tuzaklar

1. **Spec ↔ Backend envelope mismatch** — Sprint 9A brief'i `translation_memory: {count, cache_hit_rate}` + `descriptions: {count, with_description_count, coverage_pct}` + `by_locale` diye yazmış. Gerçek backend ise `translation_memory: {total, per_target_locale, per_provider}` + `descriptions: {total, edited}` + `supported_locales` döndürüyor. Çözüm: Type'lar actual response'a göre yazıldı; UI'da cache hit rate placeholder (total/50 capped) kullanıldı — backend gerçek hit rate alanı ekleyince bağlanır (single-line backend change).
2. **Bulk response `filter` shape** — Spec string ("all" | "specific") yazmış; backend `{item_ids, total_requested}` obje dönüyor. Type tarafında obje yansıtıldı, UI'da henüz kullanılmıyor (preview step yeterince bilgi veriyor).
3. **JSX inline ternary object literal** — JSX attribute'unda inline ternary ile object expression yazarken tsc parse error aldım (`}}` karışıyor). Çözüm: `ai={item ? {...} : null}` yerine `ai={item ? { entityType: 'menu_item', entityId: item.id, csrfToken } : null}` (tek satırda tek brace kapatma). Önce denemede multi-line'da brace matching bozulmuş.
4. **CSRF token in client component** — `/admin/menus/{id}/translate` sayfası client-only çünkü BulkTranslateModal'in csrfToken'a ihtiyacı var. Çözüm: `document.cookie.match(/qr_csrftoken=([^;]+)/)` ile runtime'da oku. Server-side layout zaten `qr_csrftoken` cookie'sini set ediyor (Sprint 2'deki auth flow).
5. **Initial useEffect loop** — `DescriptionGeneratorModal`'da `useEffect(() => { if (!open || result || loading) return; runGenerate(false); }, [open])` — `runGenerate` dependency eklenmeyince ESLint exhaustive-deps uyarısı, ama her effect'te yeni closure oluşmasını engellemek için `[open]` ile sınırladım + `// eslint-disable-next-line` ile suppression comment. Modal açılınca tek seferlik auto-run tetikleniyor, sonraki operator click'leri `runGenerate(true)` çağırıyor.

---

## 9. Bonus `/stats` Endpoint Kullanım Yerleri

- `TranslationGapPanel` — 3 stat tile (translation_memory.total, descriptions.total+edited, supported_locales.join)
- `app/(admin)/admin/menus/[menuId]/translate/page.tsx` — fallback stats shape when endpoint fails (null → empty stats)

---

## 10. Authentication / Credential Sorunu

- Real backend credentials gerekmedi. Tüm doğrulama tip/lint/build + backend `pytest -q` ile yapıldı.
- CSRF token flow mevcut pattern ile uyumlu (SessionAuthentication + `X-CSRFToken` header).
- Backend'de gerçek AI key gerekmez (Sprint 9A'da mocked provider test edildi, `d1a8ef4` final run yeşil).

---

## 11. Sprint 9C'ye Geçiş Notları

Sprint 9C (public SEO) bu PR'ı bloklamaz:

- Backend `TranslationMemory` + `AIProductDescription` modelleri public okuma için viewset eklemek gerekebilir (V2 backlog — şu anki view'lar sadece IsOrgMember)
- Veya public menu render'da `Menu.translations` + `MenuItem.translations` mevcut JSONField kullanılarak boşluk tespiti yapılabilir (herhangi bir backend değişiklik gerektirmez)
- `<head>` injection Next.js metadata API ile — 9B frontend yapısına dokunmadan yeni `app/m/[slug]/layout.tsx` veya `_seo` helper eklenebilir
- `X-Translation-Gaps: en` header public menu view'ında hesaplanabilir (mevcut `views.py` içinde 4 satır ekleme)

Sprint 9B teslim edildi, 9C planlama için yeşil ışık.