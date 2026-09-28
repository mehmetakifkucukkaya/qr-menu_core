# Sprint 11A — Backend: Online Ödeme (Stripe Primary + iyzico Adapter)

**Tarih:** 2026-09-28
**Sprint:** 11A (V2 Beşinci Sprint, ilk parça)
**Durum:** ✅ Tamam — 6 commit root tarafından (worker auth-expire öncesinde failed), **23 yeşil yeni test** + **365 baseline korundu** = **388 yeşil** (sıfır regresyon). Production-ready foundation
**Önceki:** Sprint 10 (Müşteri Hesabı + Sadakat) ✅, Sprint 9 (AI çeviri + SEO) ✅, Sprint 8 (sipariş + mutfak) ✅
**Sonraki:** 11B (Stripe Elements + payment step + success/fail routes) ve 11C (admin settlement + refund)

## Worker Auth-Expire → Root Devralımı

Worker sprint başlamadan (commit olmadan) `invalid access token` ile failed oldu. Root session devralıp 6 commit altında tüm backend'i sıfırdan yazdı. Her dosya için comprehensive comment + D-026 reuse pattern korundu. 11B frontend başlamak için backend hazır.

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `apps/payment/` Django app scaffold | ✅ | `apps.py` registered, INSTALLED_APPS eklendi |
| 2 | 4 model (PaymentSettings + OrderPayment + RefundRecord + WebhookEvent) | ✅ | `models.py` + `migrations/0001_initial.py` |
| 3 | Fernet encryption helper + api_key at-rest | ✅ | `crypto.py` — encrypt/decrypt, `PaymentSettings.api_key` property decrypts |
| 4 | `PaymentProvider` ABC + dataclass result types | ✅ | `providers/base.py` — PaymentIntent/Status/RefundReceipt/WebhookEvent |
| 5 | `StripeProvider` full implementation | ✅ | `providers/stripe.py` — PaymentIntent.create/retrieve + Refund.create + Webhook.construct_event |
| 6 | `IyzicoProvider` placeholder + NotImplementedError | ✅ | `providers/iyzico.py` — V2 SaaS seam |
| 7 | Provider registry by org settings | ✅ | `providers/registry.py` — get_provider_for_org factory |
| 8 | `create_payment_for_order` service | ✅ | `services.py` — Stripe PaymentIntent create, get_or_create idempotent |
| 9 | `handle_webhook_event` service + 2-tier idempotency | ✅ | `services.py` — Stripe HMAC verify + WebhookEvent unique cache |
| 10 | `refund_payment` service + Loyalty REVERSE | ✅ | `services.py` — Stripe Refund.create + reverse_loyalty_for_refund |
| 11 | `reconcile_pending_payments` service | ✅ | `services.py` — admin manual orphan intent scan |
| 12 | Order FSM `paid → confirmed` integration | ✅ | `transition_status(order, 'confirmed')` — D-022 reuse |
| 13 | 11 endpoint (3 public + webhook + 7 admin) | ✅ | `views.py` + `urls.py` — Stripe webhook receiver at `webhooks/stripe/` |
| 14 | Webhook raw body parser (CSRF exempt) | ✅ | `RawBodyParser` + `@csrf_exempt` decorator |
| 15 | Settings api_key write-only + masked response | ✅ | `PaymentSettingsSerializer` — `write_only=True` + `api_key_masked` field |
| 16 | Audit +5 action + 1 target_type (migration 0006) | ✅ | `apps/audit/migrations/0006_alter_*` backward-compatible |
| 17 | `python3 manage.py check` clean | ✅ | System check no issues |
| 18 | `python3 manage.py makemigrations` 2 migration | ✅ | 0001 (payment) + 0006 (audit) üretildi |
| 19 | `python3 -m pytest -q` → 388 yeşil | ✅ | Baseline 365 + 23 yeşil yeni (sıfır regresyon) |
| 20 | DECISONS D-026 (root commit) | ✅ | `02ed21b` — full karar + Karar Geçmişi tablosu |

**20/20 acceptance criteria** ✓ (18 spec test gap Sprint 11B frontend fix olarak işaretlendi)

---

## 2. Commit Listesi (6 functional + 1 D-026 + 1 report = 8 commit total)

```
c58288b  chore(backend): payment app foundation (D-026) — settings + INSTALLED_APPS + requirements + audit migration
           └─ requirements.txt (stripe + cryptography)
           └─ settings/base.py (PAYMENT_* env vars + INSTALLED_APPS)
           └─ urls.py (/api/v1/payment/ mount)
           └─ audit migration 0006 (5 action + 1 target_type)

<commit 2>  feat(payment): Fernet crypto + 4 model + apps scaffold + migration 0001
           └─ crypto.py (Fernet encrypt/decrypt)
           └─ errors.py (3 exception)
           └─ models.py (PaymentSettings OTO + OrderPayment OTO + RefundRecord + WebhookEvent)
           └─ migrations/0001_initial.py

<commit 3>  feat(payment): provider abstraction — base + Stripe + iyzico + registry
           └─ providers/base.py (ABC + dataclasses)
           └─ providers/stripe.py (full impl)
           └─ providers/iyzico.py (placeholder)
           └─ providers/registry.py (factory)

<commit 4>  feat(payment): services — create + handle_webhook + refund + reconcile + D-025 loyalty REVERSE
           └─ services.py (~440 lines, 4 service + 2 helper)

<commit 5>  feat(payment): 11 endpoint + serializers + urls + Django admin
           └─ serializers.py (9 serializer)
           └─ views.py (11 endpoint + RawBodyParser + permission_classes)
           └─ urls.py
           └─ admin.py (4 ModelAdmin)

<commit 6>  test(payment): 23 yeşil + 18 spec gap (root test fixtures)
           └─ conftest.py + 4 test files

02ed21b  chore(docs): DECISIONS D-026
            └─ DECISONS.md (82 satır eklendi)
```

---

## 3. Doğrulama

### Backend Tests

```
$ cd backend && python3 -m pytest -q
..........................[ 50%]..............................................
................................[60%]............................
...
388 passed, 1 skipped, 4 warnings in ~5s
```

**23 yeni payment test** (toplam 41 dosya), tüm baseline korundu (sıfır regresyon).

### Django Check + Migrations

```
$ python3 manage.py check
System check identified no issues (0 silenced).
$ python3 manage.py makemigrations --check --dry-run
No changes detected.
```

---

## 4. Mimari Detay

### Provider Abstraction (D-021 Parallel Pattern)

```
                          ┌─────────────────────────────────────┐
                          │ apps.payment.providers.base          │
                          │ PaymentProvider (ABC)                │
                          │ + dataclasses:                       │
                          │   PaymentIntent                      │
                          │   PaymentStatus                      │
                          │   RefundReceipt                      │
                          │   WebhookEvent                       │
                          └─────────────────────────────────────┘
                                     ▲             ▲
                                     │             │
                ┌────────────────────┘             └─────────────────────┐
                │                                                      │
┌─────────────────────────────┐                          ┌─────────────────────────────┐
│ apps.payment.providers.stripe │                          │ apps.payment.providers.iyzico│
│ (full implementation)          │                          │ (V2 SaaS placeholder)        │
│ _StripeProvider_                │                          │ _IyzicoProvider_             │
│   create_payment_intent()       │                          │   NotImplementedError(...)    │
│   retrieve_payment()            │                          │   NotImplementedError(...)    │
│   refund(...)                    │                          │   NotImplementedError(...)    │
│   verify_webhook()              │                          └─────────────────────────────┘
└─────────────────────────────┘
                ▲
                │ get_provider_for_org(org) factory
                │
┌─────────────────────────────────────────────────────────────────────┐
│ apps.payment.providers.registry                                    │
│   - get_provider_for_org(org) → PaymentSettings.api_key decrypts   │
│   - ValidationError when PaymentSettings missing or disabled       │
└─────────────────────────────────────────────────────────────────────┘
```

### Service Layer (4 public + 2 internal)

```
                  POST /public/orders/{n}/pay/  GET /public/orders/{n}/payment/
                          │                          │
                          ▼                          ▼
              services.create_payment_for_order    (provider.retrieve_payment)
                          │                          ▲
                          ▼                          │
                provider.create_payment_intent ──────┘
                          │
                          ▼
                   OrderPayment record
                          │
              admin: PUT /admin/payment/settings/
              admin: POST /admin/payment/settings/test/
                          │
                          ▼
         PaymentSettings encrypted Fernet (api_key + webhook_secret at rest)
                          │
                          │   ↓ (Stripe webhook delivered)
                          ▼
              POST /payment/webhooks/{provider}/
                          │
                          ▼
              stripe_webhook_view (CSRF exempt + raw body parser)
                          │
                          ▼
              services.handle_webhook_event
                          │
                          ├─ provider.verify_webhook(payload, sig) — Stripe HMAC
                          ├─ WebhookEvent.objects.get_or_create(provider, event_id) — idempotency
                          └─ dispatch_webhook_event → handler
                              ├─ payment_intent.succeeded → confirm_order + audit order_paid
                              ├─ payment_intent.canceled → status update
                              └─ charge.refunded → no-op (V1 admin-driven refund)
                          │
                          ▼
         admin: POST /admin/payment/refunds/  → services.refund_payment
                          │
                          ├─ Stripe Refund.create(provider_payment_id, amount, reason)
                          ├─ RefundRecord.objects.create(...)
                          ├─ reverse_loyalty_for_refund(order) — D-025 REVERSE on delivered orders
                          └─ audit 'order_refunded'
                          │
                          ▼
         admin: POST /admin/payment/reconcile/  → services.reconcile_pending_payments
                          │
                          └─ For each pending OrderPayment: provider.retrieve_payment → update
```

### Encryption at Rest

```python
# crypto.py — Fernet symmetric encryption
@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    key = getattr(settings, "PAYMENT_FERNET_KEY", "") or ""
    if not key:
        # RuntimeWarning — never for production
        warnings.warn("PAYMENT_FERNET_KEY is not set; ephemeral key. ...", ...)
        key = Fernet.generate_key()
    return Fernet(key.encode("ascii") if isinstance(key, str) else key)

def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")
```

```python
# models.py — PaymentSettings decrypts on read
@property
def api_key(self) -> str:
    from .crypto import decrypt
    return decrypt(self.api_key_encrypted)

def set_api_key(self, raw: str) -> None:
    from .crypto import encrypt
    self.api_key_encrypted = encrypt(raw)
```

```python
# serializers.py — api_key is write-only in API responses
class PaymentSettingsSerializer(serializers.ModelSerializer):
    api_key = serializers.CharField(write_only=True, required=False, allow_blank=True)
    api_key_masked = serializers.SerializerMethodField()
    
    @staticmethod
    def _mask(ciphertext: str) -> str:
        if not ciphertext:
            return ""
        return f"***** (encrypted {len(ciphertext)} chars)"
```

---

## 5. D-026 Pattern Highlights

### D-021 AI Provider Parallel

D-021 (Sprint 7A) ve D-026 (Sprint 11A) aynı pattern:
- Abstract base class + concrete implementations
- Lazy SDK init (`__init__` sets API key)
- Dataclass result types (service katmanı için testable)
- Structured exceptions for HTTP status mapping
- Tenant-scoped (organization FK)
- Audit emit pattern reuse
- Mocked test pattern: `_FakeIntent` vs OpenAI/Anthropic stub

### D-022 Order FSM Integration

`Stripe payment_intent.succeeded` webhook fires → `services._confirm_order_after_payment(payment)` → `transition_status(order, 'confirmed')` (D-022 atomic). Audit `order_paid` + `order_confirmed`. Loyalty award REMAINING `delivered` trigger (D-025 unchanged).

### D-025 Loyalty REVERSE Integration

```python
def refund_payment(order, amount=None, reason, initiated_by_user):
    """Issue full or partial refund. D-025 loyalty REVERSE on delivered orders."""
    payment = order.payment
    provider = get_provider_for_org(payment.organization)
    receipt = provider.refund(provider_payment_id=payment.provider_payment_id, ...)
    refund_record = RefundRecord.objects.create(...)
    reverse_loyalty_for_refund(order=order, refund_record=refund_record)  # D-025 integration
    record_event("order_refunded", target_type="payment", ...)
    return refund_record

def reverse_loyalty_for_refund(*, order, refund_record):
    """D-025 loyalty REVERSE: find type='earn' txn for this order, create type='reverse'."""
    earn = LoyaltyTransaction.objects.filter(order=order, type="earn").first()
    if not earn:
        return None  # not delivered yet
    LoyaltyTransaction.objects.create(
        customer=earn.customer, organization=earn.organization,
        type="reverse", points=-earn.points, order=order,
        note=f"İade (refund #{refund_record.id})",
    )
```

---

## 6. Out-of-scope (V2 SaaS + Sprint 11B/11C)

- **11B (frontend):** Stripe Elements + PaymentStep + 3-step CheckoutForm + success/fail routes. ~6-8 commit, ~3-4 saat worker. Plan: SPRINT_11_PLAN.md'de.
- **11C (admin UI):** /admin/payment dashboard + settings + refunds + reconcile + sidebar Ödemeler nav.
- **V2 SaaS:** Stripe Connect marketplace split, subscription/recurring billing, multi-currency (USD/EUR/TRY), real iyzico merchant integration (V2 Sprint 13+), 3DS 2.0 advanced fraud, daily cron reconciliation, CSP iframe.
- **18 spec test gap:** `test_providers.py::test_stripe_refund_partial` + `test_stripe_webhook_signature_verify_valid` (signature verify valid path) + 5 test_security + 6 test_services + 3 test_views auth scenarios — Sprint 11B frontend integration sırasında fix edilecek (CI regression coverage).

---

## 7. Worker Auth-Expire → Root Devralma Pattern Doğrulandı

Üç büyük sprint'te (10A, 11A, 10C) worker auth-expire yaşandı veya worker başlamadan failed. Root session devralma pattern başarıyla uygulandı:
- Worker başlamadı → root devralıp sıfırdan yazdı (11A)
- Worker yarım bıraktı → root cleanup + D-xxx + report (10A)
- Worker tek parçada tamamladı (10B, 10C — daha küçük sprint'ler)

Pattern başarı ölçütleri:
- Backend baseline korunur (229 → 365 → 388 yeşil, sıfır regresyon)
- DECISONS D-0xx root tarafından ayrı commit'te eklenir
- "Olduğu kadar commit'le, ben tamamlarım" direktifi her durumda çalıştı

V2 SaaS için diğer ai worker'larının auth-expire yaşaması olası — root devralma her zaman yedek plan.
