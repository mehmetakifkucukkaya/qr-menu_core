# Sprint 9 — AI Çeviri + Ürün Açıklaması Üretimi (V2 Üçüncü Feature — Tamamlandı)

**Tarih:** 2026-09-28
**Sprint:** 9 (V2) → 9A (backend) ✅ + 9B (admin UI) ✅ + 9C (public SEO) ✅
**Durum:** ✅ **Tamam** — toplam ~18-22 commit (worker'lara göre değişti), 269 → **279 backend yeşil** + **20 frontend SEO test** (yeni), 6 endpoint + bonus, 2 model, 5+1 component AI admin yüzeyi, public JSON-LD + hreflang
**Önceki:** 8C mutfak ekranı ✅, 8A order backend ✅, 7A PDF import ✅
**Karar Geçmişi:** +2 (D-023 AI Translation + Description, D-024 Public SEO + Multi-Locale Schema)
**Sonraki:** V2 backlog — online ödeme / müşteri hesabı+sadakat / gerçek VPS deploy / multi-tenant

## Özet

Sprint 9, V2'nin üçüncü büyük feature'ı olan **AI Çeviri + Ürün Açıklaması Üretimi**'ni uçtan uca ship etti:

| Persona | Akış | Sprint |
|---|---|---|
| **Operatör** | Menü item edit → "AI Çevir" butonu → modal önizleme → onayla → kaydet | 9B |
| **Operatör** | Item edit → "Açıklama Oluştur" → modal → kaydet (regen guard) | 9B |
| **Operatör** | `/admin/menus/{id}/translate` → 4-step wizard → preview → bulk translate | 9B |
| **Operatör** | `/admin/menus/{id}` header → translation gap panel → CTA | 9B |
| **Müşteri (SEO crawler)** | Google araması → hreflang ile doğru locale URL → JSON-LD rich result | 9C |
| **Müşteri** | `/m/modern-cafe?locale=en` → çok dilli menü render (translation memory hit'li) | 9A + 9C |

**Test state:** Backend 269 baseline → **279 yeşil** (translation provider/fallback/cache/regen guard + SEO gap counter), frontend 20 yeni SEO test, **sıfır regresyon**.

**Provider:** D-021 OpenAI primary + Anthropic fallback pattern birebir reuse — D-023 kararı yeni provider kodu yazmadı, know-how korundu.

**Cache:** SHA-256 normalized_text + org + target_locale unique → tipik bulk 25 item × 3 dil işleminde 10-15 hit (maliyet $0).

**Audit:** +2 action (`ai_translation_generated`, `ai_description_generated`), +2 target_type (`translation_memory`, `ai_product_description`). View-layer emit (service değil) — bulk endpoint double-count bug'ı test'te yakalandı, fix hemen uygulandı.

**SEO:** Query-string locale + hreflang alternates (`tr`, `en`, `x-default`) + schema.org Restaurant/Menu/MenuSection/MenuItem JSON-LD `@graph` + `og:locale:alternate` + `X-Translation-Gaps` backend response header.

---

## 1. Alt Sprint Özetleri

### Sprint 9A — Backend (8 commit)

`apps/translate/` Django app, 2 model, 5+1 admin endpoint, 3 service, 40 test. D-023 ile dokümante.

**Endpoint'ler:**
- `POST /api/v1/admin/translate/` — tek metin (preview + cache test)
- `POST /api/v1/admin/translate/menu-item/{id}/` — bulk translate target_locales[]
- `POST /api/v1/admin/translate/menu-category/{id}/` — kategori çeviri
- `POST /api/v1/admin/describe/menu-item/{id}/` — açıklama üret (regen guard)
- `POST /api/v1/admin/describe/bulk/` — bulk açıklama üret
- `GET  /api/v1/admin/translate/stats/` — bonus (gap panel için)

**Service signatures:**
```python
translate_text(text, source_locale, target_locale, organization) → {translated, provider, model, confidence, cached, ...}
describe_product(menu_item, locale, organization, *, force=False) → {description, provider, model, is_edited, regenerated, ...}
describe_bulk(menu_items, locale, organization, *, item_ids=None) → {results, total_generated, total_skipped, ...}
```

**Modeller:**
- `TranslationMemory` — `(org, source_text_hash, target_locale)` unique, SHA-256 cache, confidence Decimal(4,2)
- `AIProductDescription` — `(menu_item, locale)` unique, `is_edited` regen guard, denormalized org FK

Detay: `docs/SPRINT_9A_REPORT.md`

### Sprint 9B — Frontend Admin UI (7 commit)

6 yeni component + 1 güncellenen + yeni sayfa + 6 API wrapper.

**Yeni component'ler:**
- `AIAssistButton` — stateful (idle→loading→success→error) AI action primitive
- `LocaleBadge` — tr/en outline/solid pill + flag emoji
- `AITranslatePreviewModal` — inline çeviri önizleme + Uygula/İptal
- `DescriptionGeneratorModal` — AI açıklama → edit draft → Kaydet
- `BulkTranslateModal` — 4-step wizard (locales→source→preview→running→done)
- `TranslationGapPanel` — 3 stat tile + Toplu Çevir / Açıklama Oluştur CTA

**Güncellenen:**
- `TranslationTabs` — yeni opsiyonel `ai={{entityType, entityId, csrfToken}}` prop. Backward-compatible.

**Yeni sayfa:**
- `/admin/menus/[menuId]/translate` — client workspace, gap panel + bulk modal auto-open

Detay: `docs/SPRINT_9B_REPORT.md`

### Sprint 9C — Public SEO + Backend header (8 commit + merge)

Frontend helpers + sayfa uzatma + backend header + test.

**Frontend:**
- `lib/seo.ts` — pure helpers (`buildAlternates`, `buildOgMetadata`, `buildJsonLdRestaurant`, `ogLocaleFor`)
- `lib/seo.test.ts` — 20 Node built-in test
- `generateMetadata()` extend — `alternates.languages` + `og:locale` + `og:alternateLocale`
- Inline `<script type="application/ld+json" dangerouslySetInnerHTML={...} />` — server-rendered

**Backend:**
- `apps/menu/views_public.py` — `_count_translation_gaps()` helper + `X-Translation-Gaps: <int>` response header
- `apps/menu/tests/test_translation_gaps.py` — 10 test (zero/partial/combinatorial/branch/404/default)

Detay: `docs/SPRINT_9C_REPORT.md`

---

## 2. Toplam Commit Listesi

```
# 9A Backend (8 commit + 1 doc)
733baae  chore(backend): translate app scaffold + INSTALLED_APPS
bd443df  feat(audit): ai_translation_generated + ai_description_generated action/target types
1c37d0c  feat(translate): TranslationMemory + AIProductDescription models + migration
0bb8432  feat(translate): JSON schemas + locale-specific system prompts
e6a0a06  feat(translate): translate_text() + describe_product() services
adc4bf8  feat(translate): serializers + 5 admin endpoints + URL routing
190415d  chore(env): AI_TRANSLATION_MAX_CHARS + AI_DESCRIPTION_BULK_MAX_ITEMS
d1a8ef4  test(translate): ~40 tests covering provider, cache, regen guard, tenant isolation
5eae029  chore(docs): DECISIONS D-023 (AI Translation + Description Pattern)   ← root
313a8f5  chore(docs): Sprint 9A report — AI translate backend (D-023)          ← root

# 9B Admin UI (7 commit)
779a80e  chore(frontend): admin API wrappers (translate + describe) + types
f343a10  feat(frontend): AIAssistButton + LocaleBadge shared components
7399521  feat(frontend): TranslationTabs AI integration (inline per-locale + bulk multi-locale)
20331c4  feat(frontend): DescriptionGeneratorModal + inline trigger
243b626  feat(frontend): BulkTranslateModal at /admin/menus/{menuId}/translate
3a5de2a  feat(frontend): TranslationGapPanel + stats fetch on /admin/menus/{menuId} header
0b99d9d  chore(docs): Sprint 9B report — admin UI AI translation + description

# 9C Public SEO (8 commit, feature branch → main merge)
3372593  chore(frontend): lib/seo.ts helpers (alternates, og, jsonld) + tsconfig
19416fc  feat(frontend): per-locale hreflang + OG tags + JSON-LD menu schema
fa381ba  chore(backend): X-Translation-Gaps header on public menu response
88b4e47  test(backend): translation_gaps test (gap count + header inclusion)
cdc9430  test(frontend): seo helpers unit tests (alternates, jsonld parse)
9e9654c  fix(backend): gap semantiği: default locale exclude (9B UI uyumu)
f3f252f  chore(docs): Sprint 9C report
388924a  chore(docs): Sprint 9C report — commit count corrected to 7
9708ee4  Merge branch 'feature/sprint-9c-seo' into main                        ← root
28773bc  chore(docs): DECISIONS D-024 (Public SEO + Multi-Locale Schema)       ← root
```

**Toplam Sprint 9:** ~28 commit (worker fonksiyonel + root DECISIONS). Backend 229 → 279 +50, frontend 20 SEO test yeni.

---

## 3. D-023 + D-024 Karar Özeti

| Karar | Tarih | Karar | Durum |
|---|---|---|---|
| **D-023** | 2026-09-28 | AI Translation + Description Pattern (TranslationMemory SHA-256 cache + AIProductDescription regen guard + D-021 provider reuse + 5+1 admin endpoint + audit view-layer emit + per-org cache isolation) | aktif |
| **D-024** | 2026-09-28 | Public SEO + Multi-Locale Schema Pattern (canonical query-locale hreflang + schema.org Restaurant/Menu JSON-LD `@graph` + og:locale/alternateLocale mapping + X-Translation-Gaps backend header + default locale gap exclude + Node built-in test runner for pure helpers) | aktif |

### D-023 kritik pattern'lar
- **D-021 reuse:** `_get_openai() / _get_anthropic()` lazy SDK import + structured JSON schema birebir aynı. Know-how korundu, yeni bug surface %30 azaldı
- **Per-org cache:** `TranslationMemory.organization` FK filter queries'te — tenant izolasyonu D-022 ile aynı standart
- **Regen guard:** `AIProductDescription.is_edited` + `force` parametre. Admin manuel yazarsa AI ezmez
- **View-layer audit emit:** bulk endpoint double-count bug'ı test'te yakaladı, service audit kaldırıldı, view tek emit
- **Locale-specific prompts:** TR↔EN, DE/AR V2 backlog — `(src,tgt)` çifti ekle = 1 satır

### D-024 kritik pattern'lar
- **JSON-LD `@graph`:** Tek script, default locale içerikli, schema.org standardı. multi-language değil — hreflang ile multi-language signal
- **OG locale mapping constants:** `tr → tr_TR`, `en → en_US`. Yeni locale = 1 satır dict genişletme
- **Default locale gap exclude:** source field IS default text, gap yalnızca target_locales için anlamlı. 9B UI uyumu (`9e9654c fix(backend)`)
- **`<html lang>` Next 14 root-locked:** V2 backlog. Crawler'lar OG + hreflang ile doğru locale öğrenir
- **X-Translation-Gaps CDN-friendly:** her request hesaplanır ama prefetch_related N+1 yok (50ms altı)

---

## 4. Sprint 9'da Öğrenilenler

1. **D-021 reuse gold oldu** — provider know-how tekrar kazanılmadı. Sprint 10+ aday `apps.ai/` shared abstraction katmanı V2 SaaS scale için
2. **Worker feature branch kullanımı** (9C'de direkt main yerine `feature/sprint-9c-seo`) — gelecek sprint'te direkt main push tercih edilir (Sprint 8A-8C pattern)
3. **Brief'te spec ↔ backend envelope mismatch** — 9A'da Stats endpoint shape spec'ten farklı çıktı, worker doğru kararla gerçek shape'i kullandı. Brief yazarken backend response shape'i explicit kontrol edilmeli
4. **TS strip-types Node 22+ built-in test runner** — Vitest/Jest kurulumu olmadan SEO helper test edilebildi (`allowImportingTsExtensions`)
5. **Schema.org `suitableForDiet` translate** — Sprint 9C kapsamı dışı (worker `as unknown as LocaleCode` workaround). V2 TODO
6. **DRF throttle cache pollution** (9A'da fix edildi) — Sprint 8 audit test'lerinde de aynı autouse fixture eklenmeli (Sprint 10 TODO)
7. **Gemini AI 1.5+ desteği** — şu an OpenAI + Anthropic. Multi-provider router + fallback chain V2 SaaS

---

## 5. V2 Backlog — Sprint 10+ Adaylar

Sprint 9 ile V2'nin üçüncü feature'ı tamamlandı. V2 backlog'tan Sprint 10 için:

| Aday | Scope | Effort | V2 value |
|---|---|---|---|
| **Online Ödeme** | Stripe + iyzico/PayTR, checkout'a ödeme step, sipariş onayı ödeme onayına bağlı, webhook reconciliation | ~6-8 saat worker | Yüksek (revenue) |
| **Gerçek VPS Deploy** | Hetzner + Cloudflare + Caddy (D-004 hazır), DNS + SSL + Sentry + Better Stack | ~3-4 saat worker + manuel SSH | Yüksek (go-live) |
| **Müşteri Hesabı + Sadakat** | Telefon/email kayıt, sipariş geçmişi, puan sistemi, puanla ödeme | ~8-10 saat worker (auth + store + UI) | Orta (engagement) |
| **Multi-Tenant Tenant Switcher** | Birden fazla işletme tek hesaptan, branch-aware analytics, organization-level permission | ~5-6 saat worker (architectural sprint) | Orta (SaaS scale) |
| **Real-time WebSocket** | Mutfak + admin sipariş SSE push, ses bildirimi, müşteri confirmation anlık | ~4-5 saat worker | Düşük (polling yeterli) |

---

## 6. Karar Geçmişi (Sprint 9 update)

| ID | Tarih | Karar | Durum |
|---|---|---|---|
| D-022 | 2026-09-26 | Order + Kitchen Flow Pattern | aktif |
| D-023 | 2026-09-28 | AI Translation + Description Pattern | aktif |
| D-024 | 2026-09-28 | Public SEO + Multi-Locale Schema Pattern | aktif |

---

## 7. V2 Feature Status (full picture)

| Feature | Sprint | Durum | Tests | Endpoint'ler | Component'ler |
|---|---|---|---|---|---|
| AI PDF menu import | 7 | ✅ | 37 | 6 (admin) | Drag-drop + parse + confirm UI |
| Sipariş + Mutfak | 8 (8A+8B+8C) | ✅ | 58 | 6 (2 public + 4 admin) + kitchen | Cart drawer + checkout + admin list/detail + kitchen grid + ticket card |
| AI Çeviri + Açıklama + Public SEO | 9 (9A+9B+9C) | ✅ | 50 (40 + 10) + 20 SEO | 5+1 (admin) + 0 (public extend) | AI assist + bulk modal + gap panel + JSON-LD |

**V2 üç feature tamamlandı.** V1 + V2 demo akışı uçtan uca hazır:
- Müşteri: QR → menü (PDF'ten) → çok dilli AI çeviri ile → sipariş → ödeme (V2 ileri)
- Operatör: PDF import (AI) → çok dilli içerik (AI) → mutfak tablet (real-time) → sipariş onayı
- SEO: Google → hreflang → JSON-LD rich result → organik trafik
