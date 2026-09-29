# Sprint B — V1 Satış Hazırlık: Plan + Feature Flags + Limits (Final Rapor)

**Tarih:** 2026-09-28 → 2026-09-29 (2 gün, 3 alt sprint: B1 + B2 + B3)
**Önceki:** Sprint A ✅ (kritik public menü fix), Sprint 12A UI design system, Sprint 11A payment backend
**Sonraki:** Sprint C (onboarding wizard), Sprint D (mevzuat), Sprint E (media)

## Özet

V1 satışa hazırlık Faz 3.1 + Faz 3.2 + Faz 2.2 — `agency-qr-menu` projesini net paketlenmiş bir SaaS haline getirmek:

1. **Plan enum modeli** — 4 tier paket (Basic / Pro / Sipariş / Restoran Ops)
2. **Tenant feature flag sistemi** — per-tenant 8 boolean flag + manual override
3. **Limit enforcement** — hard-fail (HTTP 402 `LimitExceeded`)
4. **Admin UI** — `/admin/billing` sayfası (plan display, feature toggle, usage bar, limit karşılaştırma, upgrade preview)
5. **Public UI** — feature flag client reader + UpgradeBanner + conditional render + cash-only fallback

## Sprint Dağılımı

| Sprint | Commit Sayısı | Ana Deliverable |
|---|---|---|
| **B1** — Backend | 7 commit + D-028 + rapor | PlanSettings + TenantUsageCounter + 11 service + 6 admin endpoint + 8 endpoint guards |
| **B2** — Admin UI | 8 commit | /admin/billing + sidebar nav + 6 component + PlanCard + UpgradePreviewModal + ResetUsageButton |
| **B3a** — Frontend infra | 4 commit | types/public.ts + api-public fetchPublicSettings + feature-flags.tsx (Provider + hook) |
| **B3b** — Frontend integration | 6 commit | MenuViewClient FeatureFlagProvider + UpgradeBanner gerçek component + CheckoutForm cash-only + tests |
| **Toplam** | **25 commit** | — |

## Mimari Genel Bakış

```
                    ┌─────────────────────────────────────────────────┐
                    │            apps.billing/ (D-028)                  │
                    ├─────────────────────────────────────────────────┤
                    │  models.py                                        │
                    │   PlanSettings (OneToOne, 8 boolean flag + note)  │
                    │   TenantUsageCounter (monthly aggregate)          │
                    │  constants.py                                     │
                    │   PLAN_CHOICES (4 tier) + PLAN_TIER_LIMITS matrix │
                    │   FEATURE_FIELDS tuple (8 explicit names)         │
                    │  services.py (11 public function)                 │
                    │   get_plan_settings / has_feature / require_feat.. │
                    │   enforce_limit / record_usage / get_active_plan.. │
                    │   get_usage_snapshot / get_plan_limit_matrix..    │
                    │   preview_upgrade / update_plan_settings / reset.. │
                    │   get_public_settings (B3 — strict allow-list)    │
                    └─────────────────────────────────────────────────┘
                                │                              │
                                ▼                              ▼
                    ┌────────────────────┐       ┌──────────────────────┐
                    │ /admin/billing/*   │       │ /public/settings/    │
                    │  (Sprint B2)       │       │   <slug>/ (Sprint B3)│
                    │  Plan + Feature +  │       │  Tenant-safe feature │
                    │  Usage + Limit +   │       │  flags + plan tier   │
                    │  UpgradePreview +  │       └──────────────────────┘
                    │  ResetUsage        │                │
                    └────────────────────┘                ▼
                                            ┌──────────────────────┐
                                            │ FeatureFlagProvider  │
                                            │ + useFeatureFlag()   │
                                            │ + hasFeature()       │
                                            └──────────────────────┘
                                                        │
                                                        ▼
                                            ┌──────────────────────┐
                                            │ MenuViewClient       │
                                            │ CartFab / LoyaltyChip│
                                            │ AccountHeaderChip    │
                                            │ CheckoutForm         │
                                            │ UpgradeBanner        │
                                            └──────────────────────┘
```

## V1 Satışa Hazırlık Sprint'leri Durum

| Sprint | Durum | Commit Range |
|---|---|---|
| **A** — Kritik public menü bug fix | ✅ DONE | `b393982..ba3701e` |
| **B1** — Backend plan + flags + limits | ✅ DONE | `d41737a..c48ab70` |
| **B2** — Admin UI | ✅ DONE | `4d726ee..7fba663` |
| **B3** — Public UI conditional + UpgradeBanner | ✅ DONE | `9a96bba..0a63439` |
| **C** — Onboarding wizard | ⏳ PENDING | — |
| **D** — Mevzuat + printable/PDF | ⏳ PENDING | — |
| **E** — MediaAsset + S3/R2 | ⏳ PENDING | — |

## Feature Flag × Plan Matrix (Final)

| Feature | BASIC | PRO | ORDERS | OPS |
|---|---|---|---|---|
| `cart_enabled` | ❌ | ❌ | ✅ | ✅ |
| `orders_enabled` | ❌ | ❌ | ✅ | ✅ |
| `customer_accounts_enabled` | ❌ | ❌ | ❌ | ✅ |
| `loyalty_enabled` | ❌ | ❌ | ❌ | ✅ |
| `payments_enabled` | ❌ | ❌ | ❌ | ✅ |
| `ai_pdf_import_enabled` | ❌ | ✅ | ✅ | ✅ |
| `ai_translate_enabled` | ❌ | ✅ | ✅ | ✅ |
| `advanced_analytics_enabled` | ❌ | ✅ | ✅ | ✅ |

## Limit Enforcement Matrix

| Limit | BASIC | PRO | ORDERS | OPS |
|---|---|---|---|---|
| Item (product) count | 25 | 100 | 200 | sınırsız |
| Category count | 5 | 20 | 50 | sınırsız |
| Branch count | 2 | 5 | 10 | sınırsız |
| Locale count | 2 (TR+EN) | 4 | 8 | 8 |
| Monthly menu views | 1k | 25k | 100k | 1M |
| Monthly QR scans | 500 | 5k | 25k | 250k |
| AI PDF imports (monthly) | — | 10 | 50 | 500 |
| AI translate ops (monthly) | — | 100 | 1k | 50k |
| AI description ops (monthly) | — | 100 | 1k | 50k |

V1 default: hard-fail (HTTP 402 `LimitExceeded`), `BILLING_LIMIT_GRACE_PCT=0`.

## Endpoint Inventory

### Admin (Sprint B1 + B2)
- `GET  /api/v1/admin/billing/plan/` — current PlanSettings row
- `PUT  /api/v1/admin/billing/plan/` — operator manual upgrade
- `GET  /api/v1/admin/billing/usage/` — current-month metric snapshot
- `GET  /api/v1/admin/billing/limits/` — static 4-plan comparison matrix
- `POST /api/v1/admin/billing/limits/preview-upgrade/` — diff current → target
- `POST /api/v1/admin/billing/reset-usage/` — superuser demo helper

### Public (Sprint B3)
- `GET /api/v1/public/settings/<slug>/` — tenant-safe feature flags + active plan tier
  - 60/min/IP throttle
  - Strict allow-list (no `billing_notes`, no internal fields)
  - 404 unknown/inactive slug (enumeration safe)

### Endpoint Guards (Sprint B1 — `require_feature` integration)
- `apps.orders.views.PublicOrderCreateView` → `orders_enabled`
- `apps.payment.views.CreateOrderPaymentView` → `payments_enabled`
- `apps.account.views.RedeemPointsView` → `loyalty_enabled`
- `apps.account.views.RequestMagicLinkView` → `customer_accounts_enabled`
- `apps.translate.views.TranslateView` → `ai_translate_enabled`
- `apps.pdf_import.views.UploadView` → `ai_pdf_import_enabled`

### Endpoint Guards (Sprint B1 — `enforce_limit` integration)
- `apps.menu.views.MenuItemViewSet.create/update` → `items`
- `apps.menu.views.MenuCategoryViewSet.create` → `categories`
- `apps.branches.views.BranchViewSet.create` → `branches`

## Audit Integration

**+4 new action:**
- `plan_changed`
- `plan_upgraded_preview`
- `limit_exceeded_attempt`
- `feature_disabled_access`

**+1 new target_type:** `plan_settings`

Migration: `apps/audit/migrations/0007_alter_*.py` (backward-compatible)

## Frontend Architecture (Sprint B3)

### Yeni Dosyalar

| Dosya | Satır | Sorumluluk |
|---|---|---|
| `apps/web/src/types/public.ts` | 83 | PlanTier + FeatureName + PublicSettings + PublicEnvelope |
| `apps/web/src/lib/api-public.ts` | 215 | fetchPublicSettings + retry helper + PublicSettingsError |
| `apps/web/src/lib/feature-flags.tsx` | 167 | Provider + hook + useFeatureFlags |
| `apps/web/src/lib/feature-flags-helpers.ts` | ~30 | hasFeature() pure helper (Node test compat) |
| `apps/web/src/lib/feature-flags.test.ts` | ~80 | 10 test case (Node test runner) |
| `apps/web/src/components/billing/UpgradeBanner.tsx` | 190 | Sticky banner + inline variant |

### Modified Components

- `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` — server fetchPublicSettings + 60s revalidate
- `apps/web/src/components/menu/MenuViewClient.tsx` — FeatureFlagProvider wrap + sticky header
- `apps/web/src/components/menu/AccountHeaderChip.tsx` — customer_accounts_enabled + loyalty_enabled gates
- `apps/web/src/components/menu/HeaderCartIcon.tsx` — cart_enabled gate
- `apps/web/src/components/menu/ItemCard.tsx` — sepete ekle / qty selector conditional
- `apps/web/src/components/order/CartDrawer.tsx` — orders_enabled gate (cart preview vs sipariş butonu)

## Test Durumu

### Backend
- **438 yeşil** (Sprint B1 baseline 429 + Sprint B3 +9 yeni public settings test)
- 18 payment spec gap pre-existing (Sprint 11B scope, dokunulmadı)
- Sprint B1 test breakdown: 4 plan_model + 8 feature_flags + 7 limit_enforcement + 7 views + 6 security + 1 factory = 33
- Sprint B3 test breakdown: 1 unknown slug 404 + 1 inactive slug 404 + 1 OPS full-true + 1 BASIC all-false + 1 manual override + 1 internal field leak + 1 throttle scope + 1 all 4 plan renderability + 1 service unit = 9

### Frontend
- `npm run type-check` → 0 error
- `npm run lint` → 0 warning
- `npm run build` → 33 route başarılı, `/m/[businessSlug]` 25.2 kB / 119 kB first-load JS
- `npm run test:feature-flags` → 10/10 yeşil
- Pre-existing frontend test: currency.test.ts 9/9 + seo.test.ts 20/20 yeşil korundu

## Manuel Test Senaryoları

### Modern Cafe BASIC'e Geçiş

```bash
docker exec qrmenu-backend python manage.py shell -c "
from apps.organizations.models import Organization
from apps.billing.services import update_plan_settings
org = Organization.objects.get(slug='modern-cafe')
update_plan_settings(org, active_plan='basic')
"
```

Reload `/m/modern-cafe` (Next.js cache 60s revalidate içinde yansır).

**Gizlenen elementler:**
| Feature flag false | Etki |
|---|---|
| `cart_enabled` | HeaderCartIcon null • ItemCard "Sepete ekle" / qty gizli • CartDrawer içi null |
| `loyalty_enabled` | AccountHeaderChip LoyaltyBadge null |
| `customer_accounts_enabled` | Hesabım + Giriş Yap linki null |
| `orders_enabled` | CartDrawer "Sipariş Ver" → "Sipariş verme pakete dahil değil" mesajı |
| `payments_enabled` | CheckoutForm → UpgradeBanner + cash-only onay checkbox'ı, submit disabled |

**Görünen element:** Sticky top'da `<UpgradeBanner feature="cart_enabled" targetPlan="orders">` "Sepet özelliği QR Sipariş planına dahil. [Yükselt →]" CTA `/admin/billing`'e.

### OPS Plan'a Geri Dönüş

```bash
docker exec qrmenu-backend python manage.py shell -c "
from apps.organizations.models import Organization
from apps.billing.services import update_plan_settings
org = Organization.objects.get(slug='modern-cafe')
update_plan_settings(org, active_plan='ops')
"
```

`hasFeature(settings, 'cart_enabled')` true → banner `null`, tüm gizli elementler geri gelir.

### Admin UI

`/admin/billing`:
- Aktif plan kartı OPS badge (violet)
- 8 feature toggle list (8 açık)
- Usage progress bar × 5 (views/scans/ai_pdf/ai_translate/ai_description — hepsi 0/limit)
- Limit karşılaştırma tablosu (4 plan side-by-side, OPS highlight)
- Upgrade preview dropdown + modal (feature/resource delta)
- (superuser only) "Demo: aylık kullanımı sıfırla" butonu

Sidebar'da "Plan & Limitler" item (Banknote ikon).

## Karar Geçmişi

- **D-024** (Sprint A) — V1 Satış Hazırlık Critical Fixes (public payload + currency + QR)
- **D-025** (Sprint 10A) — Müşteri Auth + Sadakat (LoyaltySettings OneToOne pattern reuse)
- **D-026** (Sprint 11A) — Online Ödeme + Provider Abstraction
- **D-027** (Sprint 12A) — UI/UX Design System
- **D-028** (Sprint B1) — Plan + Feature Flags + Limits Pattern (backend)
- **D-029** (Sprint B3 — follow-up) — Public Feature Flag Reader + Plan-Aware UI Pattern

## Out-of-Scope (V2 SaaS)

- Stripe webhook + self-serve checkout
- Free trial flow (Sprint C onboarding wizard'da eklenir)
- Overage billing notification
- Multi-region pricing
- Coupon codes
- Prorated billing / downgrade
- Revenue analytics dashboard
- Celery monthly counter reset cron (V1 manual reset endpoint yeterli)
- `LocaleSelector` overlap with sticky UpgradeBanner (V2 follow-up)

## Bilinen Trade-off'lar (V1 Demo)

1. **`revalidate: 60` cache** — Tenant plan değişikliği en geç 60 saniye içinde yansır. Demo'da hard reload (`Cmd+Shift+R`) veya Next.js dev HMR ile anında.
2. **UpgradeBanner sticky header'ı kaplıyor** — BASIC'te geriye sadece logo + business name + LocaleSelector kalıyor; banner bunların üstünde. V1 demo için kabul edilebilir, V2 follow-up (banner'a dismiss butonu).
3. **Pre-existing 18 payment test failures** — Sprint 11B scope, Sprint B kapsamı dışı.
4. **`feature-flags.tsx` → `feature-flags-helpers.ts` refactor** — Pure helper `.ts`'e taşındı çünkü Node test runner `.tsx` import edemiyor. Sprint 12 refactor'da JSX-free helpers `.ts`'e geçirilebilir.
5. **Manual override priority** — PlanSettings effective_features() üzerinden; operator `PRO` plan'da `cart_enabled` flag override alanı. V1 demo için manuel, V2 SaaS trial extension use case.

## Sprint B Sonuçları

- ✅ 25 commit (B1: 7, B2: 8, B3a: 4, B3b: 6) — 0 regresyon
- ✅ 438 backend yeşil (429 baseline + 9 public settings)
- ✅ Frontend tsc/lint/build temiz + 10 feature-flag test
- ✅ Demo'da OPS / BASIC geçişi manuel test edildi
- ✅ 4 tier paket modeli canlı (Basic ₺99 / Pro ₺299 / Sipariş ₺599 / Ops ₺999)
- ✅ Plan + Feature Flags + Limits tam V1 demo'da görünür
- ✅ Sidebar'da "Plan & Limitler" admin nav, public'te UpgradeBanner sticky

**Sonraki sprint:** Sprint C — Self-serve onboarding wizard (Faz 3.3) → free trial flow + onboarding step'leri + "Plan seç" wizard.

V1 demo satışa hazır duruma gelmesi için Sprint C + D + E (~3 sprint daha) gerek.
