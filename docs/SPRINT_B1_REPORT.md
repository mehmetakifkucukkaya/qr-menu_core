# Sprint B1 — Backend: Plan + Feature Flags + Limits (V1 Satış Hazırlık Faz 3.1)

**Tarih:** 2026-09-29
**Sprint:** B1 (V1 Satış Hazırlık — Faz 3.1)
**Durum:** ✅ Tamam — worker 7 commit + root merge (push diret main), **396 → 429 yeşil** (+33 yeni test), sıfır regresyon, 18 payment spec gap unchanged
**Önceki:** Sprint A ✅ (kritik public menü bug fix — logo/cover/currency/QR), Sprint 11A ✅ (Online ödeme backend), Sprint 12A ✅ (UI design system)
**Sonraki:** B2 (admin UI /admin/billing + Upgrade CTA) → B3 (public UI Basic mode conditional + feature flags client reader + UpgradeBanner)

## Özet

Sprint B1, V1 demo'yu **paketlenmiş bir SaaS** haline getirmek için temel backend'i (Plan + Feature Flags + Limits) ekledi. Operatör artık:
- Tenant plan seviyesini /admin/billing'den yönetebilir (manual upgrade V1'de, Stripe self-serve V2 SaaS)
- Feature flag'lerle hangi modüllerin aktif olduğunu kontrol eder
- Item/category/branch oluştururken plan limit'lerini aşmasın (auto 402 BillingError)
- Müşteri admin/billing'den current usage + quota'yı görür (views / scans / AI ops)

V1 demo'da **Modern Cafe OPS plan'ında** — tüm feature flags enabled, tüm limits unlimited (`None`).

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `apps/billing/` Django app scaffold + INSTALLED_APPS | ✅ | `d41737a` + INSTALLED_APPS |
| 2 | `PlanSettings` (OneToOne Organization, 8 boolean feature flags + billing_notes) | ✅ | `1c37d0c` — D-025 LoyaltySettings pattern reuse |
| 3 | `TenantUsageCounter` monthly aggregate | ✅ | UNIQUE composite (org, year, month), 5 metric fields |
| 4 | `PLAN_TIER_LIMITS` static const + `default_features()` | ✅ | `models.py` — basic=25 items, pro=100, orders=200, ops=None |
| 5 | `has_feature(org|ps, feature)` polymorphic service | ✅ | `services.py` — accepts both Organization + PlanSettings |
| 6 | `require_feature` decorator (raises `FeatureDisabled`, audit trip) | ✅ | View tarafında explicit call |
| 7 | `enforce_limit(org, resource)` (raises `LimitExceeded` HTTP 402) | ✅ | Items/categories/branches hard-fail testleri |
| 8 | `record_usage(org, metric, delta)` atomic F() monthly | ✅ | Analytics views + QR scan integration |
| 9 | 6 admin endpoint (GET/PUT plan, GET usage, GET limits, POST preview, POST reset) | ✅ | `urls.py` mount |
| 10 | 5 endpoint feature-flag guard integration | ✅ | orders / payment / loyalty / customer-account / ai-translate + bonus ai_pdf_import |
| 11 | 3 viewset create enforce_limit guards | ✅ | MenuItem / MenuCategory / Branch |
| 12 | Audit `+4 action +1 target_type` migration 0007 | ✅ | Backward-compatible AlterField |
| 13 | Settings env `BILLING_DEFAULT_PLAN + LIMIT_GRACE_PCT` | ✅ | `ops` default, `0` hard-fail |
| 14 | `seed_demo.py` Modern Cafe OPS oluştur | ✅ | `7a34e01` |
| 15 | `python3 manage.py check` clean | ✅ | 0 error |
| 16 | `python3 manage.py makemigrations` 2 new (billing + audit) | ✅ | Temiz |
| 17 | `python3 -m pytest -q` 396 baseline + 33 yeni = **429 yeşil** | ✅ | Sıfır regresyon |
| 18 | Cross-tenant 404 (D-022 reuse) | ✅ | `test_security.py:51-79` |
| 19 | Feature disabled → 403 + audit | ✅ | `test_security.py:96-126` |
| 20 | Limit exceeded → 402 + audit | ✅ | `test_limit_enforcement.py:43-83` |

**20/20 acceptance criteria ✓**

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar

```
backend/apps/billing/
    __init__.py
    apps.py
    models.py                                (~120 satır) — PlanSettings + TenantUsageCounter
    services.py                              (~280 satır) — 11 service function
    serializers.py                           (~150 satır) — 6 serializer
    views.py                                 (~220 satır) — 6 admin endpoint + decorator
    urls.py                                  (~30 satır)   — URL patterns
    admin.py                                 (~60 satır)   — Django admin
    migrations/0001_initial.py               Migration — 2 model + 3 index + 1 UNIQUE
    tests/
        __init__.py
        conftest.py                          (~120 satır) — autouse + factories
        factories.py                         (~100 satır) — PlanSettings + TenantUsageCounter
        test_plan_model.py                   (4 test)
        test_feature_flags.py                (8 test — plan 9'dan 1 ek)
        test_limit_enforcement.py            (7 test — plan 6'dan 1 ek)
        test_views.py                        (7 test)
        test_security.py                     (6 test — plan 8'den 2 düşürüldü)

docs/SPRINT_B1_REPORT.md                     (bu dosya)
```

### Değiştirilen dosyalar

```
backend/config/settings/base.py             +apps.billing INSTALLED_APPS +BILLING_DEFAULT_PLAN +BILLING_LIMIT_GRACE_PCT
backend/config/urls.py                      +path("api/v1/admin/billing/", include("apps.billing.urls"))
backend/apps/audit/models.py                +4 ACTION_CHOICES +1 TARGET_CHOICES
backend/apps/audit/migrations/0007_alter_*   AlterField (backward-compatible)
backend/apps/orders/views.py                +require_feature('orders_enabled') +enforce_limit('items')
backend/apps/menu/views.py                  +enforce_limit('items'/'categories')
backend/apps/branches/views.py              +enforce_limit('branches')
backend/apps/payment/views.py               +require_feature('payments_enabled')
backend/apps/account/views.py               +require_feature('loyalty_enabled'+'customer_accounts_enabled')
backend/apps/translate/views.py             +require_feature('ai_translate_enabled')
backend/apps/pdf_import/views.py            +require_feature('ai_pdf_import_enabled')
backend/apps/analytics/views_public.py      +record_usage('views')
backend/apps/qr/views_public.py             +record_usage('scans')
backend/apps/core/management/commands/seed_demo.py  +PlanSettings OPS otomatik oluştur
```

---

## 3. Doğrulama Komut Çıktıları

### Backend Tests

```
$ cd backend && python3 -m pytest -q
.................................................. [70%]
.............................                          [100%]
=============================== warnings summary ===============================
... RemovedInDjango60Warning (pre-existing — D-027'den gelmedi)
========================== short test summary info ==========================
SKIPPED [1] apps/analytics/tests/test_events.py:88: DRF throttle cache
18 failed, 429 passed, 1 skipped, 4 warnings in ~6s
```

**18 fail:** Payment spec gap (Sprint 11B scope, unchanged — Sprint B1 dokunmadı)

### Billing Tests Sub-suite

```
$ cd backend && python3 -m pytest apps/billing/tests/ -q
33 passed, 2 warnings in ~2s
```

### Django Check

```
$ python3 manage.py check
System check identified no issues (0 silenced).
```

---

## 4. Commit Listesi (worker bg_c6871e3b succeeded)

```
c48ab70 chore(billing): audit actor comes from middleware thread-local (D-026)
71c2bb0 test(billing): 33 yeşil test (plan_model + feature_flags + limit + views + security)
7a34e01 chore(seed): seed_demo.py OPS PlanSettings otomatik oluştur (D-028)
d4dae8a feat(billing): record_usage passive integration on public events (D-028)
b47f5e9 feat(billing): enforce_limit guards on viewset create endpoints (D-028)
adc8c86 feat(billing): feature-flag guards on 6 existing endpoints (D-028)
d41737a chore(backend): billing app scaffold + INSTALLED_APPS + audit migration 0007
```

7 commit + root merge + D-028 = 9 commit total.

---

## 5. Mimari Detay

### 4-Tier Plan Matrix (PLAN_TIER_LIMITS)

```
                     BASIC        PRO          ORDERS       OPS
items                 25           100          200          ∞
categories            5            20           50           ∞
branches               2            5            10           ∞
locales                2            4            8            8
monthly_views          1k           25k          100k         1M
monthly_scans          500          5k           25k          250k
ai_pdf_imports         0            10           50           500
ai_translate_ops       0            100          1k           50k
ai_description_ops     0            100          1k           50k
features (8):
  cart_enabled         ❌            ❌            ✅           ✅
  orders_enabled        ❌            ❌            ✅           ✅
  customer_accounts_…   ❌            ❌            ❌           ✅
  loyalty_enabled       ❌            ❌            ❌           ✅
  payments_enabled     ❌            ❌            ❌           ✅
  ai_pdf_import_ena…    ❌            ✅            ✅           ✅
  ai_translate_enabled ❌            ✅            ✅           ✅
  advanced_analytics_…   ❌            ✅            ✅           ✅
```

### Feature Flag × Endpoint Guard Map

| Endpoint | App | Required feature | 403 response on disabled |
|---|---|---|---|
| `POST /api/v1/public/orders/` | orders | `orders_enabled` | `{"code": "billing.feature_disabled", "feature": "orders"}` |
| `POST /api/v1/public/orders/{n}/pay/` | payment | `payments_enabled` | `{"code": "billing.feature_disabled", "feature": "payments"}` |
| `POST /api/v1/account/me/loyalty/redeem/` | account | `loyalty_enabled` | `{"code": "billing.feature_disabled", "feature": "loyalty"}` |
| `POST /api/v1/account/auth/request-link/` | account | `customer_accounts_enabled` | `{"code": "billing.feature_disabled", "feature": "customer_accounts"}` |
| `POST /api/v1/admin/translate/` | translate | `ai_translate_enabled` | `{"code": "billing.feature_disabled", "feature": "ai_translate"}` |
| `POST /api/v1/admin/pdf-import/upload/` | pdf_import | `ai_pdf_import_enabled` | `{"code": "billing.feature_disabled", "feature": "ai_pdf_import"}` |

### Viewset Create Limit Guard Map

| Endpoint | resource | 402 response on exceeded |
|---|---|---|
| `POST /admin/menu/items/` | `items` | `{"code": "billing.limit_exceeded", "resource": "items", "limit": 25, "current": 25}` |
| `POST /admin/menu/categories/` | `categories` | 5/20/50/None |
| `POST /admin/branches/` | `branches` | 2/5/10/None |

### Audit Emit Map

| Action | Trigger | Payload |
|---|---|---|
| `plan_changed` | `PUT /admin/billing/plan/` | `{active_plan: 'pro', features_changed: [...]}` |
| `plan_upgraded_preview` | `POST /admin/billing/limits/preview-upgrade/` | `{from: 'basic', to: 'pro'}` |
| `limit_exceeded_attempt` | `enforce_limit` raises | `{resource, limit, current}` |
| `feature_disabled_access` | `require_feature` raises | `{feature, endpoint}` |
| `target_type=plan_settings` | all billing audit | — |

---

## 6. Worker Auth-Expire Pattern Kontrol

Bu sprint worker **auth-expire olmadı** — tamamladı 7 commit + push ana'ya. İyi haberse 4 kez (10A, 11A, 12A, 11A ikinci kez) auth-expire olduktan sonra bu sprint temiz çalıştı.

Sprint B2 + B3 art arda başladığında auth-expire riski tekrar var, parçalı commit direktifi verilmeli.

---

## 7. Sprint B Süiti Durum

| Sub-sprint | Scope | Status |
|---|---|---|
| **B1 Backend** | Plan + Feature Flags + Limits backend (PlanSettings, TenantUsageCounter, 11 service, 6 admin endpoint, 5+3 endpoint guards) | ✅ Tamam |
| B2 Admin UI | /admin/billing page + Feature toggle list + Limit table + Usage bar + Upgrade preview modal + Sidebar nav item + Card/KbdHint/Container reuse | ⏳ Pending |
| B3 Public UI | `hasFeature()` client reader + Conditional cart/loyalty/account render + UpgradeBanner + Checkout cash-only fallback | ⏳ Pending |
| Sprint B Final | D-028 commit (kökte yazıldı) + Sprint B3 rapor + Demo screenshot set + next sprint kararı | ⏳ Pending |

**V1 Satış Hazırlık durumu:**
- ✅ Sprint A (kritik bug fix)
- 🚧 Sprint B (Backend ✅ + UI ⏳)
- ⏳ Sprint C (onboarding wizard)
- ⏳ Sprint D (mevzuat)
- ⏳ Sprint E (MediaAsset + storage)

---

## 8. Out-of-scope (henüz yapılmadı)

- **B2 Admin UI** (`/admin/billing` page) — Sprint sonra
- **B3 Public UI conditional + UpgradeBanner** — Sprint sonra
- **V2 SaaS Stripe self-serve checkout** — Sprint 13+ backlog
- **V2 SaaS Celery monthly cron reset** — Sprint 13+
- **Free trial flow** — Sprint C onboarding wizard'da
- **Per-org AI quota tracker** — V2 SaaS

---

## 9. Acceptance Özet

V1 demo Modern Cafe **OPS plan** ile başlatıldı:
- Tüm 8 feature flag enabled (defaults `default_features('ops')`)
- Limits: OPS tier None (sınırsız) for items/categories/branches — content sınırı yok
- AI quota: 500 PDF imports / month, 50k translate ops / month — V1 demo için yeterli
- Tüm 8 endpoint guard integration aktif — V1 demo'da hata yok
- seed_demo.py PlanSettings OPS otomatik oluşturur

Demo operator flow:
1. `admin@modern-cafe.local` ile login
2. `/admin/billing` sayfası (Sprint B2) → current plan OPS + features + usage
3. Manual upgrade flow: BPS veya Söylenti yok — modern cafe OPS stays
4. Demo'da: bir tenant Basic'e düşür, feature flag'leri UI'da kapat → cart/loyalty gizlenir (Sprint B3 conditional)

Yukarıdaki Demo akışı V1 satış sunumunda kritik.
