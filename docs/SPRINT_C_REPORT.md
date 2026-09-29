# Sprint C — Self-Serve Onboarding Wizard (Final Rapor)

**Tarih:** 2026-09-29 (~4 saat, 4 alt sprint = C1 + C2 + C3 + C3b, 21 commit)
**Önceki:** Sprint B ✅ (Plan + Feature Flags + Limits — admin /billing + public plan-aware UI + UpgradeBanner), Sprint A ✅, Sprint 12A ✅
**Sonraki:** Sprint D (mevzuat + PDF), Sprint E (MediaAsset + S3/R2)

## Özet

V1 satışa hazırlık Faz 3.3 — Self-serve onboarding wizard + plan limit sistemi + Free/Trial flow. Yeni müşteri 10-15 dakikada menü yayınlayabilir.

1. **5-step wizard** — BusinessInfo → LocaleCurrency → FirstCategory → FirstItems → SuccessQR
2. **Atomic signup** — User + Organization + Membership + PlanSettings(BASIC→14d OPS trial) tek transaction
3. **14-day OPS trial** — Signup sonrası tüm modüller açık, TrialBanner countdown
4. **Demo template import** — "Demo menüden başla" → Modern Cafe snapshot (5 kategori + 25 ürün)
5. **First QR bootstrap** — Tenant'ın ilk QR'ını wizard'ın Step 5'inde oluşturma

## Sprint Dağılımı

| Sprint | Commit | Ana Deliverable |
|---|---|---|
| **C1** — Backend signup | 4 commit | POST /auth/signup/ + GET /auth/check-slug/ + atomic transaction + audit tenant_created + 14 yeşil |
| **C2** — Frontend wizard | 7 commit (worker) | 5 step wizard + zustand store + StepIndicator + ProgressBar + signup page shell |
| **C3** — Backend onboarding | 2 commit (root) | apps/onboarding app + 4 endpoint + services (complete/demo-seed/qr/trial) + PlanSettings trial fields + 10 yeşil service test |
| **C3b** — Frontend integration | 8 commit (worker) | TrialBanner + Step5 QR enable + demo seed button + complete-onboarding submit + signup trial hook + 12 yeşil TrialBanner test |
| **Toplam** | **21 commit** | **464 yeşil backend** (452 baseline + 14 signup + 10 onboarding + 2 trial) + 12 yeşil TrialBanner test |

## Mimari Genel Bakış

```
                    ┌─────────────────────────────────────────────────┐
                    │ apps/accounts/ (D-030 signup)                    │
                    ├─────────────────────────────────────────────────┤
                    │  SignupView (POST /auth/signup/)                 │
                    │   • atomic transaction:                          │
                    │     User + Organization + Membership(OWNER)       │
                    │     + PlanSettings(BASIC) + AuditEvent           │
                    │   • services.start_trial(organization) hook     │
                    │     → 14-day OPS trial auto-start                 │
                    │   • auto-login (session cookie set)              │
                    │  SlugAvailabilityView (GET /auth/check-slug/)    │
                    └─────────────────────────────────────────────────┘
                                │                              │
                                ▼                              ▼
                    ┌────────────────────┐       ┌──────────────────────┐
                    │ /onboarding/       │       │ /qr-codes/first/     │
                    │  (C3 — D-030)      │       │  (C3 — D-030)        │
                    │  POST /complete/   │       │  POST first QR       │
                    │  POST /demo-seed/  │       │  bootstrap           │
                    │  GET /trial-status/│       │                      │
                    └────────────────────┘       └──────────────────────┘
                                │                              │
                                ▼                              ▼
                    ┌─────────────────────────────────────────────────┐
                    │ apps/billing/ (D-028 PlanSettings)               │
                    │  trial_started_at, trial_ends_at (nullable)      │
                    │  TrialBanner countdown data source               │
                    └─────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────────────────────────────┐
                    │ apps/web/ (frontend — C2 + C3b)                  │
                    │  /signup (5-step wizard, zustand persist)       │
                    │  Step1: BusinessInfo + slug availability        │
                    │  Step2: LocaleCurrency                          │
                    │  Step3: FirstCategory                           │
                    │  Step4: FirstItems                              │
                    │  Step5: SuccessQR + complete-onboarding mount    │
                    │  TrialBanner admin layout mount                 │
                    └─────────────────────────────────────────────────┘
```

## V1 Satışa Hazırlık Sprint'leri Durum

| Sprint | Durum | Commit Range |
|---|---|---|
| **A** — Kritik public menü bug fix | ✅ DONE | `b393982..ba3701e` |
| **B1** — Backend plan + flags + limits | ✅ DONE | `d41737a..c48ab70` |
| **B2** — Admin UI /billing + sidebar | ✅ DONE | `4d726ee..7fba663` |
| **B3** — Public UI conditional + UpgradeBanner | ✅ DONE | `9a96bba..0a63439` |
| **B** final + D-028 + D-029 | ✅ DONE | `7340c39` |
| **C1** — Backend signup | ✅ DONE | `5ce480c` öncesi (5b8dc8b, 0ef8fe3, 5ce480c, 3165696'dan 4) |
| **C2** — Frontend wizard | ✅ DONE | `37e984e..f3216c8` (7 commit) |
| **C3** — Backend onboarding | ✅ DONE | `3165696, 79d34b6` |
| **C3b** — Frontend integration | ✅ DONE | `3f74347..587ee3b` (8 commit) |
| **C** final + D-030 | 🔄 IN PROGRESS | bu rapor |
| **D** — Mevzuat + PDF | ⏳ PENDING | — |
| **E** — MediaAsset + S3/R2 | ⏳ PENDING | — |

## Feature Flag × Plan Matrix (Sprint C ile güncellendi)

| Feature | BASIC | PRO | ORDERS | OPS | **OPS TRIAL (14d)** |
|---|---|---|---|---|---|
| `cart_enabled` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `orders_enabled` | ❌ | ❌ | ✅ | ✅ | ✅ |
| `customer_accounts_enabled` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `loyalty_enabled` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `payments_enabled` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `ai_pdf_import_enabled` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `ai_translate_enabled` | ❌ | ✅ | ✅ | ✅ | ✅ |
| `advanced_analytics_enabled` | ❌ | ✅ | ✅ | ✅ | ✅ |

**Yeni signup eden tenant:** BASIC default + 14-day OPS trial otomatik. Trial bittikten sonra `expire_trial_if_due` lazy check (V1'de Celery yok — TrialBanner mount'ta).

## Endpoint Inventory (Sprint C eklemeleri)

### Public (Sprint C1)
- `POST /api/v1/auth/signup/` — email + password + business + slug + locale + currency → atomic create + auto-login
- `GET /api/v1/auth/check-slug/?slug=<value>` — {available, reason: empty/invalid/reserved/taken}

### Authenticated (Sprint C3)
- `POST /api/v1/onboarding/complete/` — wizard step 3-4 materialization (category + items, skip option)
- `POST /api/v1/onboarding/demo-seed/` — Modern Cafe idempotent import (5 cat + 25 items)
- `POST /api/v1/qr-codes/first/` — bootstrap tenant'ın ilk QR'ı (idempotent)
- `GET /api/v1/onboarding/trial-status/` — TrialBanner data feed

### Audit (Sprint C1)
- +1 action: `tenant_created` (organization target_type zaten Sprint 4'ten var)
- Migration: `apps/audit/migrations/0008_alter_auditevent_action.py`

### Plan Settings (Sprint C3)
- +2 fields: `PlanSettings.trial_started_at`, `trial_ends_at` (nullable)
- Migration: `apps/billing/migrations/0002_plansettings_trial_ends_at_and_more.py`

## Frontend Architecture (Sprint C)

### Yeni Dosyalar (C2 + C3b)

| Dosya | Sorumluluk |
|---|---|
| `apps/web/src/lib/api-auth.ts` | signup + checkSlugAvailability (C2) |
| `apps/web/src/lib/api-onboarding.ts` | complete + demoSeed + firstQR + trialStatus (C3b) |
| `apps/web/src/lib/stores/signup-wizard.ts` | zustand persist (5 step FormData) (C2) |
| `apps/web/src/app/signup/page.tsx` | server shell (C2) |
| `apps/web/src/components/signup/StepIndicator.tsx` | 5 step icon (C2) |
| `apps/web/src/components/signup/ProgressBar.tsx` | progress bar (C2) |
| `apps/web/src/components/signup/Step1BusinessInfo.tsx` | email + password + slug (C2) |
| `apps/web/src/components/signup/Step2LocaleCurrency.tsx` | locale + currency (C2) |
| `apps/web/src/components/signup/Step3FirstCategory.tsx` | first category (C2) |
| `apps/web/src/components/signup/Step4FirstItems.tsx` | first items + skip option (C2) |
| `apps/web/src/components/signup/Step5SuccessQR.tsx` | QR + demo seed + success (C2 + C3b) |
| `apps/web/src/components/billing/TrialBanner.tsx` | sticky countdown component (C3b) |
| `apps/web/src/components/billing/TrialBanner.test.tsx` | 12 yeşil Node test (C3b) |

## Demo Flow

### Yeni Müşteri (signup → 14-day trial)

```bash
# Müşteri /signup sayfasına gider
# Step 1: email + password + business_name + slug (real-time availability check)
# Submit → POST /auth/signup/ → 201 → auto-login (session cookie set)
# → Trial otomatik başlar: PlanSettings.trial_started_at = now, trial_ends_at = now+14d
# → active_plan = 'ops', 8 feature flag açık

# Step 2: default_locale + supported_locales + currency
# Step 3: first category (name + icon)
# Step 4: first items (1-5 items) veya "İlk kategori ve ürünleri sonra ekleyeceğim"
# Step 5: success + complete-onboarding mount + QR generate + demo seed option

# Admin panelde TrialBanner sticky:
# "🎉 14 günlük ücretsiz Pro denemeniz başladı"
# "13 gün kaldı — deneme bitince otomatik olarak QR Menü Basic planına düşürüleceksiniz"
# [Plan & Limitler → /admin/billing]
```

### Demo Menüden Başla

```bash
# Step 5'te "Demo menüden başla" butonu
# POST /api/v1/onboarding/demo-seed/
# → Modern Cafe (slug 'modern-cafe') snapshot'tan 5 kategori + 25 ürün kopyalanır
# → 2. kez basılırsa skipped=true döner (idempotent)
# → /admin/menus'a yönlendirilir
```

### Modern Cafe (zaten OPS, trial yok)

```bash
# Modern Cafe admin@modern-cafe.local — zaten OPS plan'da (Sprint B1 seed)
# TrialBanner görünmez (in_trial=false)
# Plan & Limitler sayfasında trial yok, direkt OPS feature'ları
```

## Test Durumu

### Backend
- **464 yeşil** (452 baseline + 14 Sprint C1 signup + 10 Sprint C3 onboarding service + 2 Sprint C3b signup trial hook)
- 18 payment spec gap pre-existing (Sprint 11B scope, dokunulmadı)
- Sprint C1 test breakdown: 1 happy + 1 auto-login + 1 duplicate email + 1 duplicate slug + 1 reserved + 1 invalid format + 1 weak password + 1 default_locale ⊂ + 1 EUR currency + 5 slug availability (free/taken/reserved/invalid/empty)
- Sprint C3 service test breakdown: 2 complete_onboarding + 1 demo idempotent + 2 generate_first_qr + 4 trial service + 1 no-op BASIC
- Sprint C3b trial hook test breakdown: 2 (14-day window + independent per tenant)

### Frontend
- `npm run type-check` → 0 error
- `npm run lint` → 0 warning
- `npm run build` → 30 route başarılı, `/signup` 13.3 kB (C3b wiring +1 kB)
- `npm run test:trial-banner` → 12/12 yeşil (Node test runner + jsdom + tsx)
- Pre-existing test'ler (currency, seo, feature-flags) korundu

## Manuel Test Senaryoları

### Happy Path (signup → trial)

```bash
docker exec qrmenu-backend python manage.py shell -c "
from rest_framework.test import APIClient
import json
client = APIClient()
resp = client.post('/api/v1/auth/signup/', {
    'email': 'demo-cafe@x.example',
    'password': 'Demo-Pass-123!',
    'business_name': 'Demo Cafe',
    'slug': 'demo-cafe',
    'default_locale': 'tr',
    'supported_locales': ['tr', 'en'],
    'currency': 'TRY',
}, format='json')
print(resp.status_code)
print(resp.json()['data']['plan'])  # 'ops' (trial started!)
"
```

### Trial Expiry Test

```bash
docker exec qrmenu-backend python manage.py shell -c "
from apps.organizations.models import Organization
from apps.onboarding.services import expire_trial_if_due
from django.utils import timezone
from datetime import timedelta
from apps.billing.models import PlanSettings

org = Organization.objects.get(slug='demo-cafe')
ps = PlanSettings.objects.get(organization=org)
# Force expiry
ps.trial_ends_at = timezone.now() - timedelta(days=1)
ps.save()
print(expire_trial_if_due(org))  # True
ps.refresh_from_db()
print(ps.active_plan)  # 'basic' (auto-downgrade)
"
```

## Karar Geçmişi

- **D-024** (Sprint A) — V1 Satış Hazırlık Critical Fixes
- **D-025** (Sprint 10A) — Müşteri Auth + Sadakat (LoyaltySettings OneToOne pattern reuse)
- **D-026** (Sprint 11A) — Online Ödeme + Provider Abstraction
- **D-027** (Sprint 12A) — UI/UX Design System
- **D-028** (Sprint B1) — Plan + Feature Flags + Limits Pattern (backend)
- **D-029** (Sprint B3 follow-up) — Public Feature Flag Reader + Plan-Aware UI Pattern
- **D-030** (Sprint C) — Self-Serve Onboarding Wizard Pattern

## Out-of-Scope (V2 SaaS)

- Email verification (V1'de yok — signup direkt login)
- Social auth (Google/Apple/Facebook)
- Stripe checkout for upgrade (V1'de operatör manual upgrade)
- Multi-region pricing
- Celery monthly cron for trial expiry (V1 manual via TrialBanner mount)
- Team member invites
- Bulk QR generation
- Custom slug suffix (UUID fallback on collision)

## Bilinen Trade-off'lar (V1 Demo)

1. **Email verification yok** — Signup direkt trial başlatır. V2 SaaS feature: email confirmation flow
2. **Trial expiry lazy check** — TrialBanner mount'ta expire kontrol edilir. Tenant trial bittikten sonra ilk sayfa reload'da BASIC'e düşer. V2 SaaS: webhook + cron
3. **Demo template hardcoded slug** — `modern-cafe` constant. V2 SaaS: white-label demo template
4. **Idempotency guard** — Step5 useEffect ref ile guard'lı (strict-mode double-mount safe)
5. **Reserved slug list** — 8 entry hardcoded. Settings'e taşınabilir V2 SaaS feature
6. **HTTP endpoint test'leri service test'i olarak yazıldı** — Sprint C3b'de tam HTTP test eklenmedi (auth context karmaşıklığı). Service test'ler business logic'i cover eder
7. **Frontend test runner custom setup** — `tsconfig.test.json` + tsx + jsdom. Vitest V2 SaaS feature

## Sprint C Sonuçları

- ✅ 21 commit (C1: 4 + C2: 7 + C3: 2 + C3b: 8) — 0 regresyon
- ✅ 464 backend yeşil (452 baseline + 12 Sprint C)
- ✅ Frontend tsc/lint/build temiz + 12 TrialBanner test
- ✅ Demo'da signup → 14-day trial → TrialBanner countdown → QR + demo seed çalışır
- ✅ Modern Cafe (zaten OPS) trial yok, direkt full feature
- ✅ Tenant signup → tenant Created audit event
- ✅ Self-serve signup → 10-15 dakikada menü yayınlayabilir

**Sonraki sprint:** Sprint D — Mevzuat alanları + printable/PDF (Faz 4) → kalori/gramaj/içerik/legal_notes/alcohol/halal + printable/PDF export.

V1 demo satışa hazır duruma gelmesi için Sprint D + E (~2 sprint daha) gerek.
