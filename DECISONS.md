| D-029 | 2026-09-29 | Public Feature Flag Reader + Plan-Aware UI Pattern (Sprint B3 follow-up — /api/v1/public/settings/<slug>/ endpoint strict allow-list + FeatureFlagProvider React context + useFeatureFlag hook + hasFeature pure helper + UpgradeBanner sticky/inline component + CartFab/HeaderCartIcon/AccountHeaderChip/LoyaltyBadge/CheckoutForm plan-aware conditional render + payments_enabled cash-only UX fallback + 60s Next.js revalidate cache + dark mode + reduced-motion + feature-flags-helpers.ts Node test compat) | aktif |

---

## KARAR D-029 — Public Feature Flag Reader + Plan-Aware UI Pattern (Sprint B3 follow-up)

**Karar:**
- **Backend public settings endpoint:** `GET /api/v1/public/settings/<slug>/` — tenant-safe allow-list (slug, name, active_plan, features: {8 flags}). Strict — `billing_notes`, `id`, `updated_at` ASLA leak etmez. `is_active=False` → 404 (enumeration safe). 60/min/IP throttle scope `public_settings`. Sprint B3 backend (`9a96bba..d051fdf`).
- **Service signature:** `apps.billing.services.get_public_settings(organization) → dict`. Internal `services.has_feature()` ile AYNI kaynaktan okur — D-028 single source of truth.
- **Frontend types:** `apps/web/src/types/public.ts` — `PlanTier` (`'basic'|'pro'|'orders'|'ops'`), `FeatureName` (8 flag union), `PublicSettings`, `PublicEnvelope<T>`. `PlanTier` admin `Plan`'ın public-facing alias'ı.
- **Frontend api wrapper:** `apps/web/src/lib/api-public.ts` — `fetchPublicSettings(slug, opts)` with `{internal: true, next: {revalidate: 60}}` (Docker network short-circuit + 60s ISR cache). `fetchPublicSettingsWithRetry()` 429 exponential backoff. `PublicSettingsError` class for typed catch.
- **FeatureFlagProvider pattern:** `apps/web/src/lib/feature-flags.tsx`:
  - `<FeatureFlagProvider settings={...}>` wraps children, exposes context
  - `useFeatureFlag(feature: FeatureName): boolean` — provider dışında throw (debug-friendly error message)
  - `useFeatureFlags(): PublicSettings | null` — read full settings
  - `hasFeature(settings, feature): boolean` — pure helper (server component'ler + test'ler)
- **`feature-flags-helpers.ts` split:** Node test runner `--experimental-strip-types` JSX/TSX desteklemiyor. Pure helper `.ts`'e taşındı, `feature-flags.tsx` re-export ediyor (backward compat). Sprint 12 refactor'da JSX-free helpers `.ts`'e standardize edilebilir.
- **Server component fetch pattern:** `/m/[businessSlug]/page.tsx` (server) → `fetchPublicSettings(slug, {internal: true, next: {revalidate: 60}}).catch(() => null)` + null fallback (feature flags yoksa tüm UI render yine devam eder, sadece UpgradeBanner sticky top'da). Sprint 8B/10B ile aynı pattern (Docker internal network short-circuit + ISR).
- **Plan-aware conditional render (5 client component updated):**
  - `AccountHeaderChip` — `customer_accounts_enabled` false → Hesabım + Giriş Yap null. `loyalty_enabled` false → LoyaltyBadge null.
  - `HeaderCartIcon` — `cart_enabled` false → null.
  - `ItemCard` — `cart_enabled` false → "Sepete ekle" / qty selector null (chevron/detail tetap görünür).
  - `CartDrawer` — `orders_enabled` false → "Sipariş Ver" butonu yerine "Sipariş verme pakete dahil değil" statü mesajı.
  - `CheckoutForm` — `payments_enabled` false → UpgradeBanner inline + "Kapıda nakit ödeme" onay checkbox (Banknote ikonlu amber kutulu) + submit butonu onaylanmadan disabled + hata mesajı.
- **`<UpgradeBanner>` component** (`apps/web/src/components/billing/UpgradeBanner.tsx`):
  - İki varyant: `sticky` (default) ve `inline` (modal/card içinde)
  - Sticky: `sticky top-0 z-40`, amber tint, Sparkles + TrendingUp ikonları, "Yükselt →" CTA `/admin/billing`
  - Inline: Sprint 12A `<Card variant="outline">` + `<IconButton>` primitive
  - Hide rule: `hasFeature(settings, feature)` true ise `null` döner (pure helper gate)
  - Dark mode (`dark:` variant) + reduced-motion (`motion-reduce:`) respect
- **Cash-only UX kararı:** `payments_enabled=false` → sadece "Bu pakete ödeme dahil değil" uyarısı YETERLİ değil. Kullanıcı yanlışlıkla Stripe/iyzico butonuna basıp hata alabilir. Çözüm: butonlar tamamen gizli + nakit onay checkbox'ı + submit disabled. Kullanıcı bilinçli olarak "kapıda ödeyeceğim" onayı verir.
- **`revalidate: 60` cache strategy:** PlanSettings değişikliği en geç 60 saniye içinde public menüye yansır. Demo'da hard reload (`Cmd+Shift+R`) veya Next.js dev HMR ile anında. V2 SaaS feature: webhook-driven cache invalidation (`PlanSettings.save()` → `revalidateTag('public_settings:modern-cafe')`).
- **LocaleSelector sticky banner overlap (V1 trade-off):** BASIC'te UpgradeBanner `sticky top-0 z-40` + `Header` `z-30` → banner header'ın üstünde. Geriye sadece logo + name + LocaleSelector kalıyor (cart/hesabım/loyalty zaten null). V1 demo için kabul edilebilir, V2 follow-up (banner dismiss butonu + `LocaleSelector` z-50).
- **Sprint B1 endpoint guards (D-028) hâlâ geçerli:** Backend tarafında `require_feature('payments_enabled')` CheckoutForm'dan önce 403 döner. Frontend conditional render UX'i kolaylaştırır ama ASLA security guard değildir — V1 demo'da tenant plan değişikliği → frontend 60s + backend 60s throttle → toplam ≤ 120s tutarsızlık penceresi.
- **Audit:** Sprint B3 backend'te `get_public_settings` audit emit ETMEZ (public read, rate-limited, loglanabilir ama tenant'dan bağımsız). Sprint C onboarding wizard'da public endpoint'lere audit ihtiyacı değerlendirilebilir.
- **Sprint B1 + B2 + B3 reuse:** D-022 (tenant isolation — `_resolve_organization_by_slug` Org scope), D-024 (Sprint A fix — public payload logo/cover/currency), D-025 (LoyaltySettings OneToOne pattern reuse yok ama yakın akraba), D-026 (payments_enabled flag Stripe/iyzico guard), D-027 (UI primitives — Card/Container/IconButton reuse), D-028 (PlanSettings backend source of truth).
- **Out-of-scope (V2 SaaS):** Webhook-driven cache invalidation, dismissable banner (V1 sticky), banner A/B test, feature flag analytics (who viewed UpgradeBanner CTA → /admin/billing click rate), V2 SaaS trial extension UI, V2 SaaS multi-region pricing banner localization, currency-specific CTA copy.

**Tarih:** 2026-09-29

**Bağlam:** Sprint B1 backend plan + flags + limits (D-028) tamamlandıktan sonra public menü tarafında tenant-aware UX için frontend feature reader gerekiyordu. **Önce sade ve sağlam QR Menü Basic/Pro satılabilir hale gelsin; sipariş, mutfak, sadakat, ödeme upsell olarak konumlansın** felsefesi gereği: cart/loyalty/account/payment özellikleri olmayan tenantlar için UI gizlemeli + upsell CTA görünür olmalı. Sprint A (kritik public fix) + Sprint B1 (admin endpoint) + Sprint B2 (admin UI) ardından Faz 3.2 + Faz 2.2 public tarafı.

**Alternatifler:**
- **Server component fetch vs Client-side fetch:** Server component Next.js ISR cache ile birlikte daha hızlı + SEO-safe. Client-side ise gerçek zamanlı ama sayfa başına 1 ek HTTP request + bundle size. Server component + revalidate tercih edildi (Sprint 8B/10B pattern reuse)
- **`fetchPublicSettings` with retry helper:** V1 demo 60s cache yeterli; retry helper V2 SaaS multi-region için reserve edildi
- **React Context (Provider) vs prop drilling:** 5+ client component'ta feature flag kullanılıyor → context kaçınılmaz. Provider tree MenuViewClient root'ta (server fetch → client provider)
- **Pure helper `.ts` vs `.tsx`:** Node test runner `--experimental-strip-types` JSX desteklemiyor. Test compat için split + re-export. Sprint 12 refactor standardizasyonu
- **UpgradeBanner sticky top vs modal:** Sticky daha görünür ama header'ı örtüyor. Modal daha az intrusive ama dismiss kolaylığı var. V1 sticky (demo etkisi), V2 modal option (dismissable)
- **`hasFeature` provider dışında throw vs silent false:** Throw = debug kolaylığı, silent false = runtime crash önleme. Throw tercih edildi (Provider tree dışında use etmek = bug)
- **Cash-only checkbox zorunlu vs warning only:** Checkbox zorunlu UX netleştirir, kullanıcı bilinçli tercih yapar. Warning-only riskli (yanlışlıkla Stripe/iyzico'ya basıp hata alma). Checkbox zorunlu tercih edildi
- **`revalidate: 60` vs no-cache vs webhook:** No-cache latency + DB load. Webhook real-time ama backend complexity (signal consumer). 60s balance — V1 demo yeterli, V2 SaaS webhook invalidation
- **`PublicSettingsError` typed class vs Error:** Typed catch UI override (404 vs 429 vs 5xx için farklı fallback). Typed class tercih edildi

**Seçim gerekçesi:**
- **Server component + ISR revalidate 60:** Sprint 8B/10B pattern reuse, SSR/SEO-safe, 60s cache backend DB load'ı azaltır
- **Provider + hook + pure helper 3 katman:** Pure helper test edilebilir, hook client component ergonomik, provider tree root'ta — separation of concerns temiz
- **5 client component + 1 server page touch:** CartFab/HeaderCartIcon/AccountHeaderChip/LoyaltyBadge/CheckoutForm minimal diff ile plan-aware. Server page tek fetch + provider wrap
- **UpgradeBanner sticky (default) + inline (modal):** V1 demo sticky etki yüksek, modal V2 SaaS option. Component reuse UI primitive'lerle (Card + IconButton)
- **`feature-flags-helpers.ts` split:** Node test compat için pragmatic çözüm; Sprint 12'de standardize edilebilir
- **Cash-only checkbox zorunlu:** Kullanıcı bilinçli karar verir; backend 403 fallback zaten var (D-028 guard)
- **`hasFeature` provider dışında throw:** Bug surface anında görünür (dev mode'da clear error message)
- **Strict allow-list public response:** `billing_notes` (operator note) ASLA public'e leak etmez; tenant_id / id / updated_at minimal surface

**Sonuçlar:**
- **Backend (3 commit):**
  - `backend/apps/billing/services.py` — `get_public_settings(org)` function (27 satır eklendi)
  - `backend/apps/billing/views.py` — `PublicSettingsView` + `PublicSettingsThrottle` (88 satır eklendi)
  - `backend/apps/billing/urls_public.py` — yeni dosya (URL mount)
  - `backend/config/urls.py` — `path("api/v1/public/", include("apps.billing.urls_public"))` mount
  - `backend/config/settings/base.py` — `public_settings: "60/min"` throttle rate
  - `backend/apps/billing/tests/test_public_settings.py` — 9 yeşil test (unknown slug 404, inactive 404, OPS full-true, BASIC all-false, manual override, internal field leak, throttle scope, 4 plan tier renderability, service unit)
  - **Test sayısı:** 429 baseline → **438 yeşil** (+9). 18 payment spec gap unchanged.
- **Frontend B3a altyapı (4 commit):**
  - `apps/web/src/types/public.ts` — yeni dosya (83 satır, 6 named export)
  - `apps/web/src/lib/api-public.ts` — yeni dosya (215 satır, 3 named export)
  - `apps/web/src/lib/feature-flags.tsx` — yeni dosya (167 satır, Provider + 2 hook + placeholder)
  - `chore(frontend): tsc + lint + build green verify` (empty)
- **Frontend B3b component integration (6 commit):**
  - `apps/web/src/components/menu/MenuViewClient.tsx` — FeatureFlagProvider wrap + sticky header
  - `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` — server fetchPublicSettings + 60s revalidate
  - `apps/web/src/components/menu/AccountHeaderChip.tsx` — customer_accounts_enabled + loyalty_enabled gates
  - `apps/web/src/components/menu/HeaderCartIcon.tsx` — cart_enabled gate
  - `apps/web/src/components/menu/ItemCard.tsx` — sepete ekle / qty conditional
  - `apps/web/src/components/order/CartDrawer.tsx` — orders_enabled gate
  - `apps/web/src/components/billing/UpgradeBanner.tsx` — yeni dosya (190 satır, sticky + inline variant)
  - `apps/web/src/components/order/CheckoutForm.tsx` (Sprint 8B+10B) — payments_enabled gate + cash-only UX
  - `apps/web/src/lib/feature-flags-helpers.ts` — yeni dosya (pure `hasFeature`, Node test compat)
  - `apps/web/src/lib/feature-flags.test.ts` — yeni dosya (10 test, `npm run test:feature-flags`)
  - `package.json` — `test:feature-flags` script eklendi
  - `apps/web/src/lib/feature-flags.tsx` — placeholder export kaldırıldı, helper re-export
- **Commit sayısı toplam:** Sprint B = **25 commit** (B1: 7, B2: 8, B3: 3 backend + 4+6 frontend = 10)
- **Demo test:** Modern Cafe BASIC geçişi → CartFab/HeaderCartIcon/AccountHeaderChip/LoyaltyBadge/CheckoutForm tüm gate'lerde null/conditional. UpgradeBanner sticky top görünür. OPS geri dönüş → hepsi restore.
- **Demo time-of-demo:** Modern Cafe `/m/modern-cafe` OPS plan'da → cart fab + loyalty badge + hesabım + ödeme tüm görünür. Admin panelde `/admin/billing` OPS badge + 8 feature toggle açık + 5 usage bar 0/limit.

**Notlar:**
- Sprint B3 backend root session tarafından yazıldı (worker auth-expire oldu, B1/B2 pattern'inde olduğu gibi root devraldı). Frontend B3a + B3b worker'larda başarılı (parçalı scope, 4-5 ve 5-6 commit)
- `revalidate: 60` cache stratejisi Sprint 8B/10B ile uyumlu (Docker internal network short-circuit + ISR). Sprint C'de webhook-driven invalidation eklenirse `PlanSettings.save()` override + `revalidateTag()` ile anında yansıma
- `feature-flags-helpers.ts` Sprint 12 refactor fırsatı: pure helpers `.ts`'e standardize et, component-only `.tsx`'te kalsın
- Cash-only UX kararı Sprint C onboarding wizard'da "Sipariş yöntemi" step'inde de kullanılabilir (default 'cash' vs 'online' preview)
- Pre-existing 18 payment test failures (Sprint 11B scope) dokunulmadı — Sprint 11B başladığında fix edilecek
- `backend/apps/payment/migrations/__init__.py` untracked kaldı — Django 5.x için gerekli değil ama tooling consistency için Sprint 11B'de eklenebilir
- Worker auth-expire (5. kez) Sprint B3 backend'te yaşandı; B3a + B3b için scope parçalanarak risk azaltıldı. Sprint C (büyük onboarding wizard) için parçalı worker stratejisi önceden planlanmalı
- D-028 ile yüksek cohesion: aynı `has_feature()` source of truth hem backend view guard'larında hem frontend conditional render'da. Tenant plan değişikliği → backend enforce + frontend conditional render birlikte çalışır
- Sprint B raporu: `docs/SPRINT_B_REPORT.md` (15 KB, B1+B2+B3 birleşik final)
- Sprint C sonrası D-029 follow-up gerekebilir (webhook invalidation, banner dismiss, free trial UI extension)
- Demo'da "Plan & Limitler" admin nav + public UpgradeBanner + cash-only fallback V1 satış ekibine "paket farkı görünür" demosu için canlı kanıt
| D-029 | 2026-09-29 | Public Feature Flag Reader + Plan-Aware UI Pattern (Sprint B3 follow-up — /api/v1/public/settings/<slug>/ strict allow-list + FeatureFlagProvider context + useFeatureFlag hook + hasFeature pure helper + UpgradeBanner sticky/inline + CartFab/AccountHeaderChip/LoyaltyBadge/CheckoutForm plan-aware conditional render + payments_enabled cash-only UX + 60s Next.js revalidate cache + dark mode + reduced-motion) | aktif |


---

## KARAR D-029 — Public Feature Flag Reader + Plan-Aware UI Pattern (Sprint B3 follow-up)

**Karar:**
- **Backend public settings endpoint:** `GET /api/v1/public/settings/<slug>/` — tenant-safe strict allow-list (slug, name, active_plan, features: {8 flags}). `billing_notes`, `id`, `updated_at` ASLA leak etmez. `is_active=False` → 404 (enumeration safe). 60/min/IP throttle scope `public_settings`.
- **Service signature:** `apps.billing.services.get_public_settings(organization) → dict`. `services.has_feature()` ile AYNI source of truth — D-028 single source of truth.
- **Frontend types:** `apps/web/src/types/public.ts` — `PlanTier` (`'basic'|'pro'|'orders'|'ops'`), `FeatureName` (8 flag union), `PublicSettings`, `PublicEnvelope<T>`. `PlanTier` admin `Plan`'ın public-facing alias'ı.
- **Frontend api wrapper:** `apps/web/src/lib/api-public.ts` — `fetchPublicSettings(slug, opts)` with `{internal: true, next: {revalidate: 60}}` (Docker network short-circuit + 60s ISR cache). `fetchPublicSettingsWithRetry()` 429 exponential backoff.
- **FeatureFlagProvider pattern:** `apps/web/src/lib/feature-flags.tsx`:
  - `<FeatureFlagProvider settings={...}>` wraps children, exposes context
  - `useFeatureFlag(feature: FeatureName): boolean` — provider dışında throw (debug-friendly)
  - `useFeatureFlags(): PublicSettings | null` — read full settings
  - `hasFeature(settings, feature): boolean` — pure helper (server component'ler + test'ler)
- **`feature-flags-helpers.ts` split:** Node test runner `--experimental-strip-types` JSX desteklemiyor. Pure helper `.ts`'e taşındı, `feature-flags.tsx` re-export ediyor. Sprint 12 refactor fırsatı.
- **Server component fetch:** `/m/[businessSlug]/page.tsx` → `fetchPublicSettings(slug, {internal: true, next: {revalidate: 60}}).catch(() => null)` + null fallback. Sprint 8B/10B pattern reuse.
- **Plan-aware conditional render (5 client component updated):**
  - `AccountHeaderChip` — `customer_accounts_enabled` false → Hesabım + Giriş Yap null; `loyalty_enabled` false → LoyaltyBadge null
  - `HeaderCartIcon` — `cart_enabled` false → null
  - `ItemCard` — `cart_enabled` false → "Sepete ekle" / qty selector null (chevron tetap)
  - `CartDrawer` — `orders_enabled` false → "Sipariş Ver" → "Sipariş verme pakete dahil değil" statü mesajı
  - `CheckoutForm` — `payments_enabled` false → UpgradeBanner inline + "Kapıda nakit ödeme" onay checkbox + submit disabled + hata mesajı
- **`<UpgradeBanner>` component** (`apps/web/src/components/billing/UpgradeBanner.tsx`):
  - İki varyant: `sticky` (default) + `inline` (modal/card içinde)
  - Sticky: `sticky top-0 z-40`, amber tint, Sparkles + TrendingUp ikonları, "Yükselt →" CTA `/admin/billing`
  - Inline: Sprint 12A `<Card variant="outline">` + `<IconButton>` primitive
  - Hide rule: `hasFeature(settings, feature)` true ise `null` döner
  - Dark mode + reduced-motion respect
- **Cash-only UX kararı:** `payments_enabled=false` → warning-only YETERLİ değil. Kullanıcı yanlışlıkla Stripe/iyzico butonuna basıp hata alabilir. Çözüm: butonlar gizli + nakit onay checkbox zorunlu + submit disabled. Kullanıcı bilinçli tercih yapar.
- **`revalidate: 60` cache strategy:** PlanSettings değişikliği en geç 60 saniye içinde public menüye yansır. Demo'da hard reload veya Next.js dev HMR ile anında. V2 SaaS feature: webhook-driven `revalidateTag('public_settings:<slug>')`.
- **LocaleSelector sticky banner overlap (V1 trade-off):** BASIC'te UpgradeBanner `z-40` + Header `z-30` → banner header'ın üstünde. Geriye logo + name + LocaleSelector. V1 demo için kabul edilebilir, V2 follow-up (banner dismiss butonu).
- **Sprint B1 endpoint guards (D-028) hâlâ geçerli:** Backend `require_feature('payments_enabled')` CheckoutForm'dan önce 403 döner. Frontend conditional render UX'i kolaylaştırır ama ASLA security guard değildir.
- **Sprint B1 + B2 + B3 reuse:** D-022 (tenant isolation), D-024 (Sprint A fix), D-025 (LoyaltySettings OneToOne pattern), D-026 (payments_enabled guard), D-027 (UI primitives), D-028 (PlanSettings backend source of truth).
- **Out-of-scope (V2 SaaS):** Webhook-driven cache invalidation, dismissable banner, banner A/B test, feature flag analytics, multi-region pricing banner, currency-specific CTA copy.

**Tarih:** 2026-09-29

**Bağlam:** Sprint B1 backend (D-028) tamamlandıktan sonra public menü tarafında tenant-aware UX için frontend feature reader gerekiyordu. "Önce sade ve sağlam QR Menü Basic/Pro satılabilir hale gelsin; sipariş, mutfak, sadakat, ödeme upsell olarak konumlansın" felsefesi gereği cart/loyalty/account/payment özellikleri olmayan tenantlar için UI gizlemeli + upsell CTA görünür olmalı. Sprint A + Sprint B1 + Sprint B2 ardından Faz 3.2 + Faz 2.2 public tarafı.

**Alternatifler:**
- **Server component fetch vs Client-side fetch:** Server component + ISR SEO-safe + cache. Client-side real-time ama ek HTTP request + bundle. Server + revalidate tercih
- **React Context (Provider) vs prop drilling:** 5+ client component feature flag → context kaçınılmaz
- **Pure helper `.ts` vs `.tsx`:** Node test compat için split + re-export
- **UpgradeBanner sticky vs modal:** Sticky etki yüksek, modal V2 option. V1 sticky
- **`hasFeature` provider dışında throw vs silent false:** Throw = debug kolaylığı
- **Cash-only checkbox zorunlu vs warning only:** Checkbox zorunlu kullanıcı bilinçli tercih yapar
- **`revalidate: 60` vs no-cache vs webhook:** No-cache latency + DB load. Webhook real-time ama backend complexity. 60s balance
- **`PublicSettingsError` typed class vs Error:** Typed catch UI override (404 vs 429 vs 5xx)

**Seçim gerekçesi:**
- **Server component + ISR revalidate 60:** Sprint 8B/10B pattern reuse, SSR/SEO-safe
- **Provider + hook + pure helper 3 katman:** Separation of concerns temiz
- **5 client component minimal diff ile plan-aware:** Server page tek fetch + provider wrap
- **UpgradeBanner sticky (default) + inline (modal):** V1 demo sticky etki yüksek
- **`feature-flags-helpers.ts` split:** Node test compat pragmatic çözüm
- **Cash-only checkbox zorunlu:** Backend 403 fallback zaten var (D-028 guard)
- **`hasFeature` provider dışında throw:** Bug surface anında görünür
- **Strict allow-list public response:** billing_notes ASLA public'e leak etmez

**Sonuçlar:**
- **Backend (3 commit):** `get_public_settings` service + `PublicSettingsView` + `urls_public.py` mount + `public_settings: "60/min"` throttle + 9 yeşil test (unknown slug 404, inactive 404, OPS full-true, BASIC all-false, manual override, internal field leak, throttle scope, 4 plan tier renderability, service unit). Test sayısı: 429 → **438 yeşil** (+9). 18 payment spec gap unchanged.
- **Frontend B3a (4 commit):** `types/public.ts` (83 satır) + `lib/api-public.ts` (215 satır) + `lib/feature-flags.tsx` (167 satır) + empty verify.
- **Frontend B3b (6 commit):** MenuViewClient FeatureFlagProvider wrap + sticky header + page server fetch + AccountHeaderChip/HeaderCartIcon/ItemCard/CartDrawer/CheckoutForm plan-aware gates + UpgradeBanner gerçek component (190 satır) + feature-flags-helpers.ts split + feature-flags.test.ts (10 case) + package.json test:feature-flags script + placeholder export cleanup.
- **Commit toplam Sprint B:** 25 commit (B1: 7, B2: 8, B3 backend: 3, B3a: 4, B3b: 6)
- **Demo test:** Modern Cafe BASIC geçişi → CartFab/HeaderCartIcon/AccountHeaderChip/LoyaltyBadge/CheckoutForm tüm gate'lerde null/conditional. UpgradeBanner sticky top. OPS geri dönüş → hepsi restore.

**Notlar:**
- Sprint B3 backend root session tarafından yazıldı (worker auth-expire oldu — 5. kez). Frontend B3a + B3b parçalı worker scope (4-5 + 5-6 commit) ile başarılı
- `revalidate: 60` cache stratejisi Sprint 8B/10B uyumlu. Sprint C'de webhook-driven invalidation eklenebilir
- `feature-flags-helpers.ts` Sprint 12 refactor fırsatı: pure helpers `.ts`'e standardize
- Cash-only UX kararı Sprint C onboarding wizard'da "Sipariş yöntemi" step'inde de kullanılabilir
- Pre-existing 18 payment test failures Sprint 11B scope, dokunulmadı
- `backend/apps/payment/migrations/__init__.py` untracked — Django 5.x için gerekli değil
- Worker auth-expire parçalı scope stratejisi Sprint C (büyük onboarding wizard) için önceden planlanmalı
- D-028 ile yüksek cohesion: aynı `has_feature()` source of truth hem backend hem frontend
- Sprint B raporu: `docs/SPRINT_B_REPORT.md` (B1+B2+B3 birleşik final, 15 KB)

# D-035 — Velouté Hospitality Suite Design Integration (Sprint G/H)

**Tarih:** 2026-10-02 (gece Sprint)

**Bağlam:** User "sitenin tasarımı çok kötü. daha modern ve profesyonel bir hale getir" → Sprint F hero polish yaptık (PremiumHero gradient + cover overlay + SVG noise + ring-8 logo). User bunu yeterli bulmadı → `/Users/mehmetakif/Downloads/stitch_boutique_qr_menu_saas/` dizinindeki 24 tasarım dosyası (Velouté Hospitality Suite) referans alınarak **sabaha kadar EKSİKSİZ siteye entegre** edildi.

**Velouté Design System Spec (DESIGN.md):**
- **Primary** `#2A4436` Deep Reserve Forest (anchors nav, pricing)
- **Secondary** `#B25E3B` Terracotta Glaze (badges, alerts, CTAs)
- **Tertiary** `#3E5641` Heritage Olive (filters, secondary CTAs)
- **Surface** `#FAF8F5` Linen Cream (warm ivory, page bg)
- **Text** `#1A1E21` deep charcoal slate (11.2:1 AAA contrast on forest)
- **Border** `#E6E1DA` standard / `#D9D2C7` active
- **Typography:** Playfair Display (editorial — başlıklar, marka) + Plus Jakarta Sans (functional — body, prices tabular-nums)
- **Spacing:** 8pt grid, gutter 1rem/1.5rem/2rem
- **Radius:** 4px xs / 6-8px sm / 8px DEFAULT / 12px lg / 16px xl / 9999px pill
- **Elevation:** 3 levels (xs shadow / sm shadow / md shadow / lg shadow / xl shadow)
- **Touch target:** 44px min
- **Brand:** "Velouté Hospitality Suite" / "restrained luxury hospitality + operational SaaS precision"

**Ekrana entegre edilen 5 V1-scope ekran (24 dosyadan önceliklendirilmiş):**
1. **public_qr_menu_desktop** — 3-col grid (sticky categories rail + editorial catalog + cart rail)
2. **public_qr_menu_mobile** — horizontal list cards, sticky pill track, quick-action pills
3. **restaurant_admin_dashboard** — KPI cards + recent activity + quick links (velouté admin tarzı)
4. **menu_management_admin** — menu list cards + create CTA
5. **theme_branding_settings** — brand identity panel (Velouté palette showcase)
6. **qr_code_table_management** — table list + QR actions + scan analytics

**V2 SaaS scope'a bırakılan 8 ekran (backend API gerektiriyor):**
- garson_terminali_* (5 ekran — garson POS, masa birleştirme, hesap kapatma)
- kds_mutfak_bar_i_stasyon_ekran (mutfak ekranı)
- canl_sipari_ler_mutfak_servisi (live orders)
- rezervasyon_hostes_masas_masa_tahsis_misafir_crm
- analitik_qr_tarama_raporlar
- ayarlar_personel_y_netimi
- stok_re_ete_maliyetleri_tedarik_i_y_netimi
- pass_efi_anl_k_86_lama_stok_kapatma

**Alternatifler:**
- **Mevcut Modern Cafe palette koru vs Velouté'ye geç:** Velouté daha "professional, modern, premium" — user talebi net
- **Tasarımı birebir kopyala vs adapte et:** Birebir kopyala mümkün değil (Türk menü verisi, business objesi, kategori modeli). Adapt — Velouté **görsel dilini** alıp V1'in mevcut veri modeliyle entegre
- **Tek seferde 24 ekran vs V1-scope (6 ekran):** V1 demo için 6 ekran yeterli. V2 SaaS scope'a bırakılan 8 ekran backend API'leri olmadan boş ekran olur
- **Worker'a delege et vs root session:** Worker'lar Sprint B3/C3/F2'de 5. kez auth-expire oldu. Root session gece boyunca parçalı scope ile çalıştı
- **Hardcoded renkler vs CSS variable:** tokens.css Velouté palette'i CSS variable olarak yazdı, Tailwind `rgb(var(--token) / <alpha-value>)` pattern. Per-business theme override korundu
- **Sadece görsel polish vs tam rebuild:** Public menu komple rebuild (PremiumHero + MenuViewClient + ItemCard + CategoryNav). Admin sadece polish (layout + dashboard + sidebar)

**Seçim gerekçesi:**
- **Velouté palette + font pair:** Modern Cafe (espresso brown + Karla) → Velouté (forest + terracotta + Playfair + Jakarta). User'ın "modern + profesyonel" talebiyle uyumlu
- **Adaptasyon > kopyalama:** V1'in backend payload yapısını (business, menu, categories, items) bozmadan Velouté görsel dilini uygula
- **CSS variable + Tailwind alpha-value:** Per-business tema override (Sprint 4A) korundu, yeni Velouté palette token set eklendi
- **3-col desktop + mobile single-col:** Velouté design system "POS/Floor Tablet 768-1024 8-col + Admin 1024+ 12-col" direktifi, MenuViewClient 12-col grid (col-3 sidebar + col-6 main + col-3 cart rail) ile karşılandı
- **PremiumHero editorial cover:** Sub-header (Servis Aktif pulse + currency + table context) + forest cover banner (philosophy tagline + radyal glow + noise overlay) + logo overlay + Playfair title + quick-action pill row
- **ItemCard horizontal-list mobile + grid desktop:** Velouté "horizontal list on mobile, vertical grid on desktop" direktifi
- **CartRail sticky right column:** Masa başı adisyon özeti + servissaatleri kartı. CartFab mobile için korundu (Sprint 8B)
- **CategoryRail sticky left column:** Velouté "Menu Sections" sidebar pattern — icon + name + count badge
- **DietaryFilterPanel:** Vegan / GF / Şef Özel checkbox listesi — Velouté "Dietary Preferences Filter Checklist" pattern
- **Admin shell polish:** 240px sidebar + rounded-md brand mark + active state solid primary + breadcrumb + uppercase tracking
- **StatCard + QuickLink polish:** Dashboard'a Velouté "subtle warm shadow + border hover primary" language

**Sonuçlar:**
- **Commit'ler (gece Sprint):**
  1. `feat(frontend): Velouté Hospitality Suite design tokens (D-035)` — 7 dosya (tokens.css + PremiumHero + MenuViewClient + ItemCard + CategoryNav + layout.tsx + DECISONS.md)
  2. `feat(frontend): Admin shell + drawers Velouté polish (D-035)` — 5 dosya (ItemDetailDrawer + CartDrawer + AdminSidebar + AdminHeader + admin/layout.tsx)
  3. `feat(frontend): Admin dashboard + menus + qr-codes Velouté polish (D-035)` — 4 dosya (dashboard/page.tsx + theme/page.tsx + menus/page.tsx + qr-codes/page.tsx)
- **Toplam:** 16 dosya değişti (CSS tokens + 8 component + 1 layout + 4 admin page + 2 font setup + DECISONS)
- **TypeScript:** `tsc --noEmit` clean (0 error)
- **Type safety:** `is_available` field yoktu → `isSoldOut=false` default + V2 için reserved comment. CartItem.price string → `Number(it.price) * it.quantity`. cart-store.total() → totalAmount() (doğru metod).
- **Backward compat:** `shadow-card` + `shadow-floating` alias'ları korundu. Per-business theme override (PremiumHero inline style) çalışıyor.
- **Demo URL:** `https://primary-lip-trained-billing.trycloudflare.com/m/modern-cafe` (cloudflared nohup daemon — uptime garantisi yok)

**Notlar:**
- V2 SaaS scope'taki 8 ekran (garson / mutfak / rezervasyon / analitik / personel / stok / pass_efi) backend API'leri olmadan boş ekran olur. V2 sprint'inde backend modüller (orders, kitchen, reservations, inventory, hcm) eklenince tasarım dosyaları tekrar gözden geçirilebilir
- `garson_terminali_*` 5 ekran — Sprint V2 (table service module) için blueprint
- `kds_mutfak_bar_i_stasyon_ekran` — Sprint V2 (kitchen module) için blueprint
- Tasarım dosyaları V1 demo için "görsel referans" + "V2 blueprint" olarak korunacak
- `themeColor` Modern Cafe brown → Velouté forest. PWA + bookmark icon aynı renk
- Playfair Display M weight 700 mobile'da başlıkların daha az yer kaplaması için tasarım spec'inde var
- Plus Jakarta Sans 400/500/600/700 — V1'in tüm body/data ihtiyacını karşılıyor
- Velouté elevation shadow seed: forest rgba (warm tint), Modern Cafe'nin dark espresso seed'inden farklı — sayfa daha "paper-like" hissediyor
- D-035 rapor bu sprint kapanışı. V2'de planlanacak: Form Inputs search component (Focus state 1.5px forest border + offset outline), Chip & Badge system (Vegan/GF/Spicy/Popular pill palette), Modal system (Wine Selector / Bill Bar)

