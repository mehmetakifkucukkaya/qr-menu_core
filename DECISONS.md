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


# D-036 — Mobile-First Responsive Pattern (Sprint I)

**Tarih:** 2026-10-02 (gündüz Sprint, User feedback)

**Bağlam:** User "mobil öncelikli olsun. mobil düzeni sorunsuz ve optimum seviyede olmalı. her telefon ekranında uyumlu responsive bir yapıda olmalı." — QR menü müşterilerin %70+ telefondan okutuyor, Sprint G Velouté redesign desktop 3-col grid getirdi ama mobile deneyimi unuttu.

**Mevcut durum (Sprint G öncesi):**
- Sprint 12A: tailwind mobile-first, badge tr avatar 24px, button 36-40px
- Sprint F: PremiumHero cover banner py-10 default (aşırı büyük mobile'da)
- Sprint G: 3-col desktop grid (mobile'da `hidden lg:flex` ile gizli), CartFab `bottom-6 right-4`
- Sorunlar:
  - Sub-header 3 satıra wrap oluyor iPhone SE'de (375px)
  - Cover banner gereksiz büyük padding
  - ItemCard görsel 40 + text 18 + button 44 = ~140px, scroll şişman
  - Qty ± stepper 36px (Apple HIG 44 altı)
  - Drawer `max-h-90vh` — iOS Safari URL bar collapse ile clipping
  - Sticky header padding `py-2.5` çok büyük
  - Quick-action pills centered grid, telefonda dar

**Hedef:** 320px-414px viewport aralığında (iPhone SE → iPhone Plus) optimum:
- Single line sub-header
- Compact cover banner (py-8)
- Sticky chrome 48px (header) + 36px (pill nav) = 84px (önceden ~110px)
- 44px tüm tap target (Apple HIG / Material Design 48 hedefi, 44 minimum)
- safe-area-inset-bottom padding (iPhone home indicator)
- 16px minimum font (Safari auto-zoom engelleme)
- dvh (dynamic viewport height) drawer

**Alınan kararlar:**

**Karar 1: safe-area-inset-* utilities global.css'e**
- `.safe-bottom` — padding-bottom: max(env(safe-area-inset-bottom), 0.5rem)
- `.safe-top` — padding-top: max(env(safe-area-inset-top), 0.5rem)
- `.safe-bottom-fixed` — bottom: max(env(safe-area-inset-bottom), 0.75rem)
- `.no-zoom` — font-size: max(1rem, 16px) (Safari input focus zoom engelleme)
- Viewport meta: userScalable=true (kullanıcı isterse zoom), maximumScale=5, colorScheme light/dark

**Karar 2: Sub-header dense (mobile-first)**
- Önce: 3 satır (Servis Aktif + saat + adres, sağda TR/EUR/USD + masa chip)
- Şimdi: 1 satır telefonlarda — Servis Aktif + TR + [masa chip md+]
- Adres + saat pill'leri md+ otete geçti (lg breakpoint'te inline)
- TR pill h-7 sm:h-8, font 10px sm:text-xs

**Karar 3: Cover banner kompakt mobile**
- py-14 → py-8 mobile, sm+:py-10 sm+:md:py-14
- H2 text-xl sm:text-3xl md:text-4xl (xl yeterli telefonda)
- Şef meta satırı hidden < sm (display chat'i kesmek için)

**Karar 4: Quick-action pills stack → grid**
- Mobile: grid-cols-1 (full-width dikey, adres-ara-whatsapp üst üste)
- sm+: flex-wrap inline (yatay centered)
- active:scale-[0.98] thumb feedback

**Karar 5: ItemCard compact mobile**
- h-40 → sm:h-40 (mobile'da 28 = 7rem hero image)
- Body padding p-4 → p-3 sm:p-4
- Title lg → text-base sm:text-xl (16px mobile)
- Price base → text-sm sm:text-lg
- Add button: h-11 (44px), ml-auto (sağa dayal)
- Qty ± stepper: 9 → 11 (44px tap)
- Tarif Kökeni hint hidden < sm

**Karar 6: Sticky chrome optimization**
- Header: h-12 sm:h-14 (önce p-y dense)
- AccountHeaderChip hidden < sm (mobile sheet task V1.5)
- LocaleSelector + HeaderCartIcon phones'ta görünür kal

**Karar 7: CategoryNav compact**
- top-12 sm:top-14 (sticky header'ın altına)
- py-2 sm:py-3
- Chip min-h-36 sm:min-h-44, px-3 sm:px-4, text-xs sm:text-sm
- IntersectionObserver rootMargin: -88px sm+, -48px mobile (sticky chrome yüksekliği)

**Karar 8: Drawer safe-area + dynamic viewport**
- max-h-[92dvh] ItemDetailDrawer (önceden 90vh)
- max-h-[90dvh] CartDrawer (önceden 85vh)
- safe-bottom utility (iPhone home indicator)
- dvh: Safari URL bar collapse ile doğru viewport yüksekliği

**Karar 9: CartFab safe-area**
- bottom-6 right-4 → safe-bottom-fixed right-3
- h-12 (was p-y 3)
- active:scale-[0.98]

**Sonuçlar:**
- 5 commit (4908d2d viewport+safe-area, 6fb8e7a hero, 0bb7ab32 sticky+cartfab, 3a7f3d7 itemcard, 847174d categorynav+drawer)
- 9 dosya değişti (layout.tsx + globals.css + 7 component)
- TypeScript clean (`tsc --noEmit`)
- Test viewport aralığı: 320 / 360 / 375 / 414 / 768 / 1024 / 1280
- Toplam: Sprint G/H (4 commits) + Sprint I (5 commits) = 9 sprint commit
- DECISONS: 35 + 1 (D-036) = 36

**Backlog (V1.5 mobile follow-up):**
- AccountHeaderChip mobile sheet (drawer'dan açılan alt sayfa)
- Touch gesture swipe-to-close drawers
- Haptic feedback (navigator.vibrate) on add-to-cart
- Pull-to-refresh on menu page
- Image lazy loading priority (LCP image eager, rest lazy)
- Bottom sheet adisyon özeti (masa başı cart)


---

# D-037 — Signup Akışının Uçtan Uca Çalışır Hale Getirilmesi (CSRF + Idempotency + Locale Kalıcılığı)

**Tarih:** 2026-11-11

**Bağlam:** Signup wizardı görsel olarak "bitmiş" görünüyordu ama gerçekte üç ayrı eksik vardı ve hepsi sessizdi. (1) `Step5SuccessQR.tsx` session-cookie'li POST'ları CSRF token **olmadan** gönderiyordu — Django `SessionAuthentication` her session-auth POST'ta CSRF zorunlu kılar, yani 403. Kullanıcı yine de "başarılı" ekranını görüyordu, arkasında hiçbir şey yoktu. (2) `complete_onboarding` idempotent değildi — istek tekrarlandığında (kayıp yanıt retry'si) ilk kategori iki kez oluşuyordu. (3) Step 2'de seçilen dil ve para birimi **hiçbir yere yazılmıyordu**; tenant her zaman varsayılanları alıyordu. Django test client'ı CSRF uygulamadığı için backend testleri bunların hiçbirini göremiyordu — sadece tarayıcı görüyordu.

**Karar 1: CSRF token'ı write'ların içine taşı (`onboardingWrite`)**
- `apps/web/src/lib/api-onboarding.ts` — `onboardingWrite(run, options)` yardımcısı: `fetchCsrfToken()` çağırır, token'ı `run(csrfToken)`'a verir, çağrı bittikten sonra token'ı önbellekten düşürür (`resetOnboardingCsrfToken()`). Token her write'ta yeniden alınmaz — üç write'ta üç CSRF round-trip'i değil, bir tane.
- `Step5SuccessQR.tsx` — `completeOnboarding`, `generateFirstQR`, `importDemoTemplate` artık `onboardingWrite((csrfToken) => ...)` ile gönderiliyor. CSRF'siz gönderilen tek bir POST kalmadı.

**Karar 2: `complete_onboarding` idempotent (`get_or_create`)**
- `backend/apps/onboarding/services.py` — kategori `(menu, slug)` üzerinden `get_or_create` (MenuCategory `unique_together = ("menu", "slug")`). Ürünler `(menu, category, name)` üzerinden eşleştirilir; yoksa oluşturulur, varsa fiyat/açıklama güncellenir.
- **Not:** `MenuItem` modelinde `slug` alanı **yok** — eşleştirme `name` üzerinden yapıldı. Kategori slug'ı `slugify(name)` ile üretiliyor.
- Retry'da fiyat değişikliği de yansıyor: "Menemen 85 → 90 TL" ikinci write'ta güncelleniyor, silinmiyor.

**Karar 3: Step 2 locale/currency için ayrı kalıcılık endpoint'i**
- **Yeni:** `POST /api/v1/onboarding/preferences` (`OnboardingPreferencesView` + `OnboardingPreferencesSerializer`). Payload: `default_locale`, `supported_locales` (max 8), `currency` (TRY/EUR/USD/GBP). `default_locale` `supported_locales` içinde olmalı.
- Neden ayrı endpoint, `complete_onboarding` payload'ına eklemek değil: tenant zaten Step 1'de oluşuyor. Locale seçimi Step 2'de, `complete` çağrısı ise Step 5'te oluyor. Tek payload'da birleştirmek, tenant oluşmadan önce locale yazmaya çalışmak demek — yani ya tenant'ı Step 1'de oluşturmak (artık çok geç, kullanıcı Step 2'de zaten ilerlemiş olur) ya da write'ları ikiye bölmek. İki write zaten kaçınılmazdı; ayrı endpoint ikisini de açık ve testlenebilir kıldı.
- `apply_preferences(organization, *, default_locale, supported_locales, currency)` — tenant'ı **ve mevcut Menu kayıtlarını** günceller.
- Rol kuralı: `backend/apps/accounts/roles.py` → `^/api/v1/onboarding/preferences$` → WRITE, ONLY_OWNER. `backend/tests/test_role_gate.py` MATRIX'e satır eklendi.

**Karar 4: `check_count_limit` ayrı `enforce_limit`'den**
- `backend/apps/billing/services.py` — `check_count_limit(org, resource, count)` **istenen** değere göre kontrol eder; `enforce_limit` mevcut sayıyı baz alır. Locales limiti için `enforce_limit` kullanılamazdı: 2 dilli bir tenant kendi 2 dilini bile kaydedemezdi (mevcut=2, istenen=2 → `2 > 2` değil ama mevcut dil + yeni dil = 3 → yine de kırılıyordu). Doğru kontrol `current + (yeni - eski)` veya doğrudan istenen sayıdır.

**Karar 5: Auto-slug yarış koşulu düzeltmesi (Step1)**
- `suggestSlugFromBusiness` artık `window.setTimeout(..., 0)` ile focus'un oturmasını bekliyor, `slugFocusedRef` ve `slugRef` kullanıyor. Önceden slug alanına yazan kullanıcının yazımı ortasına öneri giriyordu: `e2e-cafee2e-cafe-mwckb6u5`. Slug doluysa öneri hiç yapılmıyor.

**Karar 6: CSRF regresyon testi gerçek enforcement ile**
- Django test client `enforce_csrf_checks=True` verilmezse CSRF uygulamaz — eski testler 403'ü göremiyordu. Doğru desen: `APIClient(enforce_csrf_checks=True)` + `force_login(user)` + `client.get("/api/v1/auth/csrf").json()["csrfToken"]` + `HTTP_X_CSRFTOKEN=token`. Token'sız → 403, token'lı → 201. `backend/apps/onboarding/tests/test_signup_flow.py` (11 test).

**Alternatifler:**
- **CSRF'yi exempt etmek** (`authentication_classes = []` veya `@csrf_exempt`) — reddedildi. Django'nun neden böyle kurulduğunu bozuyor; frontend zaten doğru token'ı alabiliyor. Sorun frontend'deydi, korumayı kaldırmak sorunu çözmezdi.
- **Locale'ı `complete_onboarding` payload'ına eklemek** — reddedildi, yukarıdaki zamanlama sorunu.
- **Ürün eşleştirmesini `slug` ile yapmak** — mümkün değil, `MenuItem`'da slug alanı yok.

**Seçim gerekçesi:**
- Idempotency frontend'de değil backend'de yapılmalı — ağ kaybı, tarayıcı retry'si ve iki sekme aynı isteği gönderebilir. Sunucu tarafında `get_or_create` tek doğru yer.
- Locale kalıcılığı ayrı endpoint — write'lar zaten iki adımda gerçekleşiyor, birleştirmek zamanlama sorunu yaratırdı.
- Test gerçek enforcement ile — Django test client'ın CSRF'i varsayılan olarak uygulamaması, bu alandaki hataların backend testlerinde görünmez olmasının sebebiydi. Test, production davranışını taklit etmeli.

**Sonuçlar:**
- Yeni: `backend/apps/onboarding/tests/test_signup_flow.py` (11 test), `apps/web/e2e/signup.spec.ts` (2 browser testi)
- Backend: **1207 passed, 2 skipped** (1197'den +10 net)
- `apps/web/playwright.config.ts` → `SIGNUP_ENABLED: "1"` (e2e stack throwaway; prod'da signup kapalı)
- e2e: signup spec 2 passed; `tsc --noEmit` ve `next lint` temiz

---

# D-038 — GitHub Actions CI: `scripts/release_gate.sh` Her Push'ta

**Tarih:** 2026-11-11

**Bağlam:** Projede CI yoktu. Tüm doğrulama (`scripts/release_gate.sh`) lokalde, geliştiricinin terminalinde çalışıyordu — ve "çalıştırmadım" demek, kod yazmak kadar kolay bir seçenekti. Pilot müşterilere teslim edilecek bir kod tabanı için bu kabul edilemez: regresyon ancak müşteri başında fark edilirdi.

**Karar:**
- **Yeni** `.github/workflows/ci.yml` — trigger: `push` (tüm branch'ler) + `pull_request` + `workflow_dispatch`.
- **Concurrency:** `group: ${{ github.workflow }}-${{ github.ref }}`, `cancel-in-progress: true` — aynı branch'e arka arkaya push'larda eski koşuş iptal edilir, CI kuyruğu tıkanmaz.
- **Environment:** Python 3.12 + Node 20 (Dockerfile pinleriyle birebir aynı — CI ile prod arasında sürüm farkı olmaz).
- **Install:** `pip install -r backend/requirements-dev.txt` + `npm ci`.
- **Playwright:** `npx playwright install --with-deps chromium`.
- **Gate:** `CI: "1"` env ile `bash scripts/release_gate.sh` — **tek job, tek komut**. CI, geliştiricinin lokalde çalıştırdığıyla birebir aynı kapıdan geçer. Ayrı bir CI özel adım listesi yazmak, iki kapının ayrışması demekti.
- **`.env.production` yok → prod env doğrulaması atlanır** (release_gate.sh içinde kasıtlı; `.env.production` sunucuda local). CI'da bu adımın "geçti" görünmesi yanıltıcı olurdu, bu yüzden açıkça atlandı.

**Alternatifler:**
- **Ayrı CI adımları** (pytest / tsc / lint / playwright ayrı job'lar) — reddedildi. Paralel job'lar hızlıdır ama kapıyı tanımı iki yere bölünür; `release_gate.sh` bozulan/eskimiş bir script olur ve kimse fark etmez. Tek kapı, tek doğru yer.
- **GitHub Actions yerine başka CI** — yok, repo zaten GitHub'da.

**Seçim gerekçesi:**
- Lokal ile CI aynı kapıdan geçmeli. Kapı iki yere bölünürse "lokalde geçti" ile "CI yeşil" arasındaki fark bir hata noktası olur.
- Tarayıcı flow'ları kapatılmadı. Projenin temel değeri orada (`/m/[slug]` menü, sipariş, mutfak). CI'da bunları kapatmak, kapıyı ucuzlatmak ama anlamsızlaştırmak olurdu.

**Sonuçlar:**
- Her push artık tam kapıdan geçiyor: backend pytest → tsc → lint → e2e tsc → 21 frontend unit suite → Playwright 7 flow.
- **Kanıt:** ilk CI koşusu signup e2e testini yakaladı (aşağıdaki D-039) — yani CI tam da yakalamak için kurulduğu şeyi yakaladı.

---

# D-039 — Kullanım Limitlerinin Tamamlanması + 402 "Yükselt" Banner'ı

**Tarih:** 2026-11-11

**Bağlam:** `PLAN_TIER_LIMITS` matrisinde tanımlı 6 limit vardı ama bunların hiçbiri enforcement'a bağlı değildi — `PlanSettings`'te gösteriliyor, ölçülmüyor, uygulanmıyordu. Yani bir tenant BASIC paketteyken sınırsız AI çeviri çağırabiliyordu. Bu, "limit" kelimesinin pazarlama malzemesi olmaktan çıkması demek.

**Karar 1: Limit enforcement'ı backend'de**
- `backend/apps/billing/constants.py` — `USAGE_LIMIT_RESOURCES` (monthly_views, monthly_scans, ai_pdf_imports, ai_translate_ops, ai_description_ops) + `USAGE_LIMIT_COUNTER_FIELD` eşlemesi (kaynak → `TenantUsageCounter` alanı).
- `backend/apps/billing/services.py` — `enforce_usage_limit(org, resource, units=1)`: `current + units > limit` ise `LimitExceeded` fırlatır. `LimitExceeded.extra` dict'inde `resource`, `current`, `limit` taşır; `http_status == 402`, `code == "billing.limit_exceeded"`.
- `check_count_limit(org, resource, count)` — istenen değere göre kontrol (locales için; D-037 Karar 4).

**Karar 2: Limitler nerede uygulanıyor (ve nerede uygulanmıyor)**
- **AI endpoint'leri** (`backend/apps/translate/views.py`): 5 endpoint (`/translate/`, `/translate/menu-item/`, `/translate/menu-category/`, describe tek, describe bulk) `_ai_guard()` ile korundu. **Sayaç başarılı provider çağrısından sonra artırılır** — başarısız çağrı faturalanmaz. Bulk'ta `units=len(menu_items)`.
- **PDF import** (`backend/apps/pdf_import/views.py`): `ai_pdf_imports` aylık limiti + başarılı parse sonrası sayaç artırma.
- **Locales** (`backend/apps/organizations/views.py` `update()` override + `backend/apps/onboarding/views.py` preferences): `check_count_limit` ile kontrol.
- **monthly_views / monthly_scans** (`backend/apps/analytics/views_admin.py`): **admin analytics overview'da** uygulanıyor — public menüde **değil**.

**Karar 3: Neden views/scans limiti public menüde değil**
- Müşterinin misafirleri menüyü **her zaman** açabilmeli. Menüyü kesmek = işletmenin müşterisine satış faturası kesmek. Satın alınabilir olan şey **ziyaret analitiği**: işletme "aylık 5.000 ziyaret görüntüleme" paketini aldıysa, analitik verisini göremez. Bu, plan satışının satın alınabilir kısmı.
- Bu ayrım bilinçlidir ve bir sonraki kişiye yanlış anlaşılmasın diye burada yazıyor.

**Karar 4: 402 bildirimi merkezi**
- `apps/web/src/lib/api-admin.ts` — `adminFetch` 402'yi yakalar, `resource`/`current`/`limit` çıkarır, `raiseLimitNotice()` ile client store'a yazar (lazy dynamic import — server bundle'ı kirletmemek için).
- `apps/web/src/lib/stores/limit-notice.ts` — zustand store (`raise`/`dismiss`), `LimitResource` tipi, `LIMIT_LABEL` sözlüğü, `limitLabel()`.
- `apps/web/src/components/billing/LimitBanner.tsx` — amber "Yükselt" banner'ı, `data-testid="limit-banner"`.
- `apps/web/src/app/(admin)/admin/layout.tsx` — `<LimitBanner />` admin shell'e eklendi.
- **Neden her formun kendi banner'ı yok:** 402 birden fazla yerde çıkabilir (analytics, AI çeviri, PDF import). Her forma ayrı banner koymak, "hangi butonda ne oldu" takibi gerektirir ve banner'ların birbirini ezmesine yol açar. Tek nokta (shell) + banner'ın kaynağı (store) → tek doğru yer.

**Karar 5: Analytics sayfasında 402 mesajı**
- `apps/web/src/app/(admin)/admin/analytics/page.tsx` — 402'de genel "tekrar deneyin" hatası yerine limit mesajı + Yükselt CTA. "Tekrar deneyin" yanlıştı — limite ulaşıldığında tekrar denemek hiçbir şeyi düzeltmez.

**Alternatifler:**
- **Limitleri public menüde uygulamak** — reddedildi, yukarıdaki gerekçe.
- **Başarısız AI çağrısını da saymak** — reddedildi. Kullanıcıya faturası kesilmemesi gerekir; başarısız çağrı onun hatası değil, sağlayıcının.
- **Her forma ayrı limit banner'ı** — reddedildi, yukarıdaki gerekçe.
- **Limit kontrolünü yalnızca frontend'de yapmak** — reddedildi. Frontend kontrolü bir kontrol değil, bir bilgi. Enum endpoint'ler doğrudan çağrılabilir.

**Seçim gerekçesi:**
- Limit enforcement **backend'de** olmalı — API herhangi bir istemciden çağrılabilir.
- Kullanım sayacı **başarıdan sonra** artmalı — faturalanabilir olan başarılı iş.
- Banner **tek noktada** — 402 bir sistem durumu, form durumu değil.

**Sonuçlar:**
- Yeni: `backend/apps/billing/tests/test_usage_limits.py` (10 test), `apps/web/src/components/billing/LimitBanner.test.tsx` (6 test)
- `apps/web/package.json` → `test:limit-banner` script'i; `scripts/release_gate.sh` → gate'e eklendi
- Backend: **1207 passed, 2 skipped**

---

# D-040 — CI'nin İlk Koşusunun Bulduğu Yarış: Signup Submit'i Sessizce Düşüyordu

**Tarih:** 2026-11-11

**Bağlam:** D-038'de kurulan CI'nin ilk tam koşusunda 43 e2e testinden 1'i düştü: `signup.spec.ts` — "Dil ve para birimi" başlığı hiç görünmedi, wizard step 1'de takılı kaldı. Test tek başına çalışınca **geçiyordu**; tam suite içinde düşüyordu. Klasik "flake" görüntüsü, ama flake'in altında gerçek bir ürün hatası var.

**Karar:**
- **Kök neden:** `Step1BusinessInfo.handleSubmit` içinde slug kontrolü sürerken submit sessizce düşürülüyordu:
  ```ts
  if (slugStatus.kind === "checking") return;   // ← hata mesajı yok, spinner yok
  ```
  Slug kontrolü 300ms debounce'lu. Kullanıcı slug'ı yazıp hemen "Devam et"e tıklarsa kontrol hâlâ sürüyor → buton hiçbir şey yapmıyor → wizard donmuş gibi görünüyor. Kullanıcı ne hata görüyor ne de ilerleme. **Bu bir test hatası değil, ürün hatasıydı** — hızlı bir gerçek kullanıcı da aynı ekranda kalırdı.
  Neden tam suite'te düştü ama tek başına geçti: makine yoğunken denetim tamamlanmadan tıklama gerçekleşti; boşta çalışırken 300ms içinde bitmişti.
- **Çözüm:** Submit, süren kontrolü **bekler** (reddetmez). Uygulama deferred promise ile yürütülür: `slugCheckRef` içinde `{ slug, promise }` tutulur, debounce timer'ı promise'i çözer. `handleSubmit` `slugStatusRef.current.kind === "checking"` ise `await pending.promise` yapar, sonra durumu **yeniden okur** — kontrol "taken" bulduysa submit hâlâ engellenir, ama artık neden söylenir. Efekt temizlendiğinde (`settle({kind:"idle"})`) bekleyen submit asla sıkışmaz.
- **Bonus düzeltme:** `slugStatus` render sırasında okunan bir state'di; submit anındaki güncel değere ihtiyaç vardı → `slugStatusRef` eklendi. `setSubmitting(true)` beklemeden **önce** çağrılıyor, böylece buton bekleme boyunca spinner gösteriyor.

**Alternatifler:**
- **Testi "daha yavaş" yapmak** (`waitFor` ile slug'ın uygun olmasını bekle) — reddedildi. Testi yamamak, ekranda gerçekten donan bir butonu gizlerdi. Asıl düzeltme bileşende.
- **Debounce'u 0'a indirmek** — reddedildi. Her tuş vuruşunda istek atmak spam'e yol açar; debounce'un amacı bu.
- **Backend'e güvenmek ("zaten slug'ı doğruluyor")** ve frontend kontrolünü kaldırmak — kısmen doğru: backend `validate_slug` slug'ın benzersizliğini zaten reddediyor. Ama frontend kontrolü "taken"ı **erken** gösteriyor ve kullanıcıya düzeltilebilir bir mesaj veriyor; tamamen kaldırmak bu avantajı kaybettirirdi.

**Seçim gerekçesi:**
- Bir testin "flake" görünmesi, altında ürün hatası olabileceğinin sinyalidir. CI kurmanın asıl değeri de tam burada ortaya çıktı: hata lokalde 40+ koşuda görünmemişti.
- "Bekle" yaklaşımı "reddet" yaklaşımından doğru: kullanıcının niyeti "Devam et" demek; kontrol onu engellememeli, **bilgilendirmeli**.

**Sonuçlar:**
- Yeni: `apps/web/src/components/signup/Step1BusinessInfo.test.tsx` (4 test — 1. test tam olarak bu yarışı kilitler: kontrol sürerken tıklama düşmüyor; 2. test "taken" kontrolü hâlâ engelliyor; 3. test mutlu yol; 4. test auto-slug önerisinin kullanıcının slug'ını ezmediği)
- `apps/web/package.json` → `test:signup-step1` script'i; `scripts/release_gate.sh` → gate'e eklendi (21 → 22 frontend suite)
- `tsc --noEmit` temiz, `next lint` temiz, `signup.spec.ts` 2 passed

---

# D-041 — CI'nin İkinci Koşusunun Bulduğu Kırık Bağımlılık: `json-logging` Hiç Kurulmamış

**Tarih:** 2026-11-11

**Bağlam:** D-038'de kurulan CI'nin ikinci koşusu (elle tetiklenen) 4. adımda — "Install the backend dependencies" — kırıldı:

```
ERROR: Could not find a version that satisfies the requirement json-logging==1.4.1
ERROR: No matching distribution found for json-logging==1.4.1
```

`json-logging` 1.4.1 **PyPI'da hiç yayımlanmamış**. Yayımlanan sürümler arasında 1.4.0, 1.4.1rc0 (release candidate) ve 1.5.x/1.6.0 var; tam sürüm 1.4.1 yok.

**Bu neden daha önce görünmedi:** Lokal ortamda paket hiç kurulmamıştı (`ModuleNotFoundError: No module named 'json_logging'`) ve kod bunu `except ImportError` ile yutuyordu. Lokal backend testleri yeşildi — çünkü testler production log formatter'ını hiç instantiate etmiyordu.

**Daha kötüsü: sadece CI değil, production imajı da kırılıyordu.** `backend/Dockerfile` her iki requirements dosyasını da kopyalayıp kuruyor (`pip install -r /app/requirements-dev.txt`). Yani `json-logging==1.4.1` **production Docker build'ini de** kırıyordu. Deploy sırasında fark edilecek bir hata.

**İkinci hata: sınıf adı hiçbir sürümde yok.** Kod `from json_logging import JSONFormatter` yapıyordu. Yayımlanmış tüm sürümlerde sınıf adı `JSONLogFormatter` (1.0.0'dan itibaren) — `JSONFormatter` **hiçbir sürümde mevcut değil**. Yani import her zaman `ImportError` veriyor, `except ImportError` bloğu devreye giriyor ve **production hiçbir zaman JSON log üretmemiş**. Sessizce.

**Üçüncü hata: fallback de JSON değildi.** Fallback format string'i `"message":"%(message)s"` idi. Mesajda tırnak veya newline varsa üretilen satır **geçersiz JSON** oluyordu — yani log shipper'a bozuk satır gidiyordu.

**Karar: Bağımlılığı kaldır, formatter'ı yaz.**
- **Yeni:** `backend/apps/core/logging.py` → `JsonLogFormatter` (saf stdlib: `json` + `logging`). Bağımlılık yok, image build'ı kıramaz.
- Alan seti sabit: `{"ts", "level", "logger", "msg"}` (+ hata varsa `exc`, stack varsa `stack`). `ts` UTC ve `Z` designator'lı — `isoformat()` `+00:00` veriyordu, log shipper'ların timestamp parser'ı `Z` bekliyor.
- `json.dumps` kaçışı yapar: mesajda tırnak/newline/unicode olsa bile **tek satır geçerli JSON** kalıyor.
- `backend/config/settings/production.py` — `"json": {"()": "apps.core.logging.JsonLogFormatter"}`. `except ImportError` fallback'i tamamen kaldırıldı: artık kırılacak bir şey yok.
- `backend/requirements-dev.txt` — `json-logging==1.4.1` satırı **kaldırıldı** (yorumla neden açıklandı).
- `docs/DEPLOYMENT.md` — operasyonel talimat güncellendi (log şekli).

**Karar 2: Test artık davranışı ölçüyor.**
- Eski test (`test_json_logging`) settings kaynağında `"JSONFormatter"` ya da `"json_logging"` **string'i arıyordu** — yani var olmayan bir sınıf adını doğrulamış oluyordu. Bu yüzden hata testleri geçti.
- Yeni: `backend/apps/core/tests/test_logging.py` — 9 test. Tek satır geçerli JSON mu, tırnaklı mesaj geçerli kalıyor mu, newline'lı mesaj tek satırda mı, unicode kaçışlanıyor mu, exception dahil ediliyor mu, production settings formatter'ı gerçekten bu sınıfa mı işaret ediyor mu.
- `tests/test_production_settings.py::test_json_logging` artık `"JsonLogFormatter"` arıyor ve yorumla nedenini açıklıyor.

**Alternatifler:**
- **Sürümü düzeltip `json-logging==1.6.0` + `JSONLogFormatter` kullanmak** — reddedildi. Paket çalışır ama (a) hâlâ bir dış bağımlılık — bu hatayı bir daha çıkarabilir, (b) `JSONLogFormatter` çıktısı `written_at`/`msg`/`type`/`taskName` gibi alanlar üretiyor ve dokümanlanan `ts`/`level`/`logger`/`msg` şekliyle uyuşmuyor, (c) log formatter'ı için paket bağımlılığı değil savunulabilir bir maliyet değil.
- **Fallback'i düzeltip `json-logging`'de kalmak** — reddedildi. Kırık pin yine image build'ını kırar; sadece semptom gizlenmiş olur.
- **Sadece pin'i düzeltmek** — reddedildi. Sınıf adı hatası ve bozuk fallback yerinde kalır; prod hâlâ JSON log üretmez.

**Seçim gerekçesi:**
- **Bir log formatter'ı image build'ını kıramaz.** Bu paket build'ı kırdı; bu, bağımlılığın kendisi için yeterli bir gerekçe.
- **Testler davranışı ölçmeli.** "Kaynakta şu string var" testi, var olmayan bir sınıf adını doğrulamış oldu. Aynı hatayı bir daha yakalayamayacak şekilde düzeltmek, düzeltmeden daha önemli.
- **Dokümanlanan log şekli gerçek olmalı.** `DECISIONS.md` D-018 `ts`/`level`/`logger`/`msg` diyordu; gerçekte `written_at`/... üretiliyordu ve gerçekte hiçbir şey üretilmiyordu. Artık ikisi de aynı.

**Sonuçlar:**
- `backend/apps/core/logging.py` — **yeni**, `JsonLogFormatter`
- `backend/apps/core/tests/test_logging.py` — **yeni**, 9 test
- `backend/config/settings/production.py` — formatter + fallback kaldırıldı
- `backend/requirements-dev.txt` — kırık pin kaldırıldı
- `docs/DEPLOYMENT.md` — operasyonel log talimatı güncellendi
- Backend: **1216 passed, 2 skipped**
- **Doğrulama:** temiz venv'de `pip install -r backend/requirements-dev.txt` → **exit 0** (CI'ın kırıldığı adım), sonra aynı venv'de `pytest` → 1216 passed. Production settings gerçekten formatter'ı instantiate edip geçerli JSON üretiyor.
