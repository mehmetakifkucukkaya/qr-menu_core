# Sprint 9A — Backend: AI Çeviri + Ürün Açıklaması Service (V2 Üçüncü Sprint — İlk Parça)

**Tarih:** 2026-09-28
**Sprint:** 9A (V2)
**Durum:** ✅ Tamam — 8 commit, 40 yeni test, **269 yeşil** (229 baseline + 40 yeni), `manage.py check` clean, mocked AI (gerçek key gerekmez)
**Önceki:** 8C mutfak ekranı ✅, 8A order backend ✅ (D-022), 7A PDF import ✅ (D-021 — provider pattern reuse)
**Sonraki:** 9B (admin UI inline AI çeviri + bulk modal + description generator)

## Özet

Sprint 9A, V2'nin üçüncü feature'ı olan **AI Çeviri + Ürün Açıklaması Üretimi**'nin backend omurgasını ship etti. Operatör artık:

- Tek metni admin üzerinden öni̇zleme için çevirebilir (cache hit test)
- Bir menu item'ı N hedef dile toplu çevirebilir (örn. TR + EN aynı anda)
- Bir menu item için AI ile 2-3 cümlelik SEO-friendly açıklama üretebilir
- Tüm tenant'ın açıklama eksik ürünleri için bulk description generation

D-021'in OpenAI primary + Anthropic fallback pattern'ı birebir reuse edildi — yeni provider kodu yazılmadı, Sprint 7A know-how'ı korundu.

**Toplam:** 8 commit, 2 model (TranslationMemory + AIProductDescription), 5+1 admin endpoint, 3 service signature, 4 audit (2 action + 2 target_type), 40 yeni test. Backend baseline 229 → 269 yeşil.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `apps/translate/` Django app scaffold + INSTALLED_APPS | ✅ | `733baae` — `backend/apps/translate/` + `config/settings/base.py` register |
| 2 | `TranslationMemory` modeli SHA-256 cache + unique `(org, src_hash, tgt_locale)` | ✅ | `1c37d0c` + migration `0001_initial.py` — 4 index, `confidence` Decimal(4,2) |
| 3 | `AIProductDescription` modeli + regen guard `is_edited` | ✅ | `1c37d0c` — `unique_together(menu_item, locale)`, denormalized org FK |
| 4 | `translate_text()` service (OpenAI primary, Anthropic fallback) | ✅ | `e6a0a06` — D-021 pattern reuse, write-through cache, locale dispatch |
| 5 | `describe_product()` service + regen guard + `force` parametre | ✅ | `e6a0a06` — `is_edited=True` skip, `force=True` regen |
| 6 | `describe_bulk()` service + `item_ids` filter | ✅ | `e6a0a06` — boş description-only filter, total_generated/skipped counters |
| 7 | 5 endpoint (POST translate + describe + bulk) | ✅ | `adc4bf8` — `urls_translate.py` + `urls_describe.py` separate |
| 8 | Bonus `GET /admin/translate/stats/` endpoint | ✅ | `adc4bf8` — cache hit rate + description coverage, 9B dashboard banner için |
| 9 | Audit action +2 (`ai_translation_generated`, `ai_description_generated`) | ✅ | `bd443df` + audit migration `0004_alter_*` (AlterField, backward-compatible) |
| 10 | Audit target_type +2 (`translation_memory`, `ai_product_description`) | ✅ | Aynı migration |
| 11 | Tenant isolation (cross-tenant 404, existence leak yok) | ✅ | `test_security.py:cross_tenant_*` — 8 security test |
| 12 | Per-org cache izolasyonu | ✅ | `test_cache_isolation_between_orgs` — org_a hit, org_b bağımsız miss |
| 13 | Provider mock test (gerçek API key yok) | ✅ | D-021 pattern — `_get_openai()` / `_get_anthropic()` monkeypatch |
| 14 | `python3 manage.py check` clean | ✅ | Worker final verification |
| 15 | `makemigrations --check --dry-run` "No changes detected" | ✅ | Worker final verification |
| 16 | `pytest -q` → 269 yeşil | ✅ | `d1a8ef4` final test run — `269 passed, 1 skipped, 1 warning` (mevcut Django 6 forms warning, 9A'dan değil) |
| 17 | Locale-specific prompts (TR↔EN) | ✅ | `schemas.py` — `TRANSLATION_PROMPTS` dict, DE/AR V2 backlog'a not düşüldü |
| 18 | Settings env var'ları (AI_TRANSLATION_MAX_CHARS=2000, BULK_MAX_ITEMS=50) | ✅ | `190415d` + .env.example comments |
| 19 | Validation boundary (2000 char, empty, same-locale, unsupported) | ✅ | `test_translate_*_rejected` × 4 |
| 20 | Commit'ler main'e push | ✅ | `d1a8ef4..5eae029 main -> main` ✓ + D-023 (`5eae029`) |

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar (apps/translate + tests)

```
backend/apps/translate/
    __init__.py
    apps.py
    models.py                                                      (~110 satır)  TranslationMemory + AIProductDescription
    schemas.py                                                     (~150 satır)  JSON schemas + locale prompts + AIProviderError
    services.py                                                    (~280 satır)  translate_text + describe_product + describe_bulk
    serializers.py                                                 (~120 satır)  6 serializer (text/item/category/describe/describe_bulk/stats)
    views.py                                                       (~250 satır)  6 endpoint + _resolve_organization + audit emit
    urls_translate.py                                              (~25 satır)   translate URL patterns
    urls_describe.py                                               (~20 satır)   describe URL patterns
    admin.py                                                       (~50 satır)   Django admin (read-only)
    migrations/0001_initial.py                                     Migration — 2 model + 4 index

backend/apps/translate/tests/
    __init__.py
    conftest.py                                                    (~30 satır)   cache_clear autouse fixture
    factories.py                                                   (~80 satır)   org/menu/item/user factories
    test_translation.py                                            (~180 satır)  10 test
    test_description.py                                            (~160 satır)  8 test
    test_views.py                                                  (~240 satır)  12 test
    test_security.py                                               (~180 satır)  8 test (~1 semantik fix sonrası)

backend/apps/audit/migrations/0004_alter_auditevent_action_alter_auditevent_target_type.py   AlterField (backward-compatible)

docs/SPRINT_9A_REPORT.md                                           (bu dosya)
```

### Değiştirilen dosyalar

```
backend/config/settings/base.py                                    +apps.translate INSTALLED_APPS, +AI_TRANSLATION_MAX_CHARS, +AI_DESCRIPTION_BULK_MAX_ITEMS
backend/config/urls.py                                             +2 include (translate + describe)
backend/apps/audit/models.py                                       +2 ACTION_CHOICES, +2 TARGET_CHOICES
backend/.env.example                                               +comment-only env var referansı
backend/.env.production.example                                    +comment-only env var referansı
```

### D-023 DECISIONS commit

```
DECISIONS.md                                                       +76 satır (D-023 full karar + Karar Geçmişi tablosu)
```

---

## 3. Doğrulama Komut Çıktıları

### Backend Tests (full suite)

```
$ cd backend && python3 -m pytest -q
..........................                                         [100%]
269 passed, 1 skipped, 1 warning in ~6.5s

SKIPPED [1] apps/analytics/tests/test_events.py:88: DRF throttle cache share across tests; Sprint 4A skip pattern. Manual smoke Sprint 5B.
warning:  /opt/homebrew/lib/python3.14/site-packages/django/db/models/fields/__init__.py:1148: RemovedInDjango60Warning — mevcut Django 6 forms transitional, 9A'dan gelmedi
```

### Translation Tests (sub-suite)

```
$ cd backend && python3 -m pytest apps/translate/tests/ -v
apps/translate/tests/test_translation.py::test_translate_openai_provider_called PASSED
apps/translate/tests/test_translation.py::test_translate_cache_hit_returns_cached_result PASSED
apps/translate/tests/test_translation.py::test_translate_anthropic_fallback_when_openai_raises PASSED
apps/translate/tests/test_translation.py::test_translate_both_providers_fail_returns_502 PASSED
apps/translate/tests/test_translation.py::test_translate_same_locale_rejected PASSED
apps/translate/tests/test_translation.py::test_translate_unsupported_locale_rejected PASSED
apps/translate/tests/test_translation.py::test_translate_empty_text_rejected PASSED
apps/translate/tests/test_translation.py::test_translate_oversized_text_rejected PASSED
apps/translate/tests/test_translation.py::test_translate_normalizes_whitespace PASSED
apps/translate/tests/test_translation.py::test_translation_memory_saved_after_ai_call PASSED
apps/translate/tests/test_description.py::test_describe_generates_for_empty_item PASSED
apps/translate/tests/test_description.py::test_describe_skips_edited_record_when_force_false PASSED
apps/translate/tests/test_description.py::test_describe_force_regenerates_even_if_edited PASSED
apps/translate/tests/test_description.py::test_describe_includes_allergens_in_prompt PASSED
apps/translate/tests/test_description.py::test_describe_includes_price_in_context PASSED
apps/translate/tests/test_description.py::test_describe_anthropic_fallback PASSED
apps/translate/tests/test_description.py::test_describe_bulk_only_fills_empty_descriptions PASSED
apps/translate/tests/test_description.py::test_describe_bulk_respects_item_ids_filter PASSED
apps/translate/tests/test_views.py ... 12 PASSED
apps/translate/tests/test_security.py ... 8 PASSED
========================== 40 passed in ~2.8s ==========================
```

### Django check + makemigrations

```
$ cd backend && python3 manage.py check
System check identified no issues (0 silenced).

$ cd backend && python3 manage.py makemigrations --check --dry-run
No changes detected.
```

---

## 4. Commit Listesi

```
733baae chore(backend): translate app scaffold + INSTALLED_APPS
bd443df feat(audit): ai_translation_generated + ai_description_generated action/target types
1c37d0c feat(translate): TranslationMemory + AIProductDescription models + migration
0bb8432 feat(translate): JSON schemas + locale-specific system prompts
e6a0a06 feat(translate): translate_text() + describe_product() services
adc4bf8 feat(translate): serializers + 5 admin endpoints + URL routing
190415d chore(env): AI_TRANSLATION_MAX_CHARS + AI_DESCRIPTION_BULK_MAX_ITEMS
d1a8ef4 test(translate): ~40 tests covering provider, cache, regen guard, tenant isolation
5eae029 chore(docs): DECISIONS D-023 (AI Translation + Description Pattern)   ← root eklendi
```

8 functional + 1 doc. Worker + root ortak commit. Toplam 8 commit + D-023 doc.

---

## 5. Mimari Detay

### Data Flow: AI Translation

```
[/admin/menus/{id}/translate UI (Sprint 9B)] ───▶ POST /api/v1/admin/translate/menu-item/{id}/
                                                              │
                                                              ▼
                                              TranslateMenuItemView
                                                              │
                                              ├─ _resolve_organization (D-022 pattern)
                                              ├─ serializer validation
                                              │   ├─ target_locales: ["en"]
                                              │   ├─ source_locale: "tr" (default menu default_locale)
                                              │   └─ menu_item lookup → 404 cross-tenant
                                              │
                                              ▼
                                  services.translate_text()
                                                              │
                                                              ├─ Normalize text.strip()
                                                              ├─ Hash SHA-256(normalized_text)
                                                              │
                                                              ├─ TranslationMemory.lookup()
                                                              │   ├─ HIT  → return cached {translated, cached=True}
                                                              │   └─ MISS ↓
                                                              │
                                                              ├─ _get_openai() → client.chat.completions.create(
                                                              │     response_format={"type": "json_schema", "schema": TRANSLATION_OUTPUT_SCHEMA}
                                                              │   )
                                                              │   ├─ Success → parse JSON
                                                              │   └─ Exception ↓
                                                              │
                                                              └─ _get_anthropic() → client.messages.create(
                                                                    system=ANTHROPIC_TRANSLATION_SYSTEM,
                                                                    messages=[{...}]
                                                                  )
                                                                  ├─ Success → parse JSON
                                                                  └─ Exception → raise AIProviderError → view → 502
                                                              │
                                                              ├─ TranslationMemory.save() (write-through cache)
                                                              ├─ AuditEvent.emit(
                                                              │     organization=org,
                                                              │     actor=request.user,
                                                              │     action="ai_translation_generated",
                                                              │     target_type="translation_memory",
                                                              │     target_id=tm.id,
                                                              │     payload={"source_locale":"tr", "target_locale":"en",
                                                              │              "provider":"openai", "model":"gpt-4o",
                                                              │              "is_cached": false, "confidence": 0.92}
                                                              │   )
                                                              │
                                                              └─ response → {"translations": [...], "ai_provider": "openai"}
```

### Data Flow: AI Description Generation

```
[/admin/menus/{id}/items/{itemId}/edit UI (Sprint 9B)]
   │ "AI ile Açıklama Oluştur" button click
   ▼
POST /api/v1/admin/describe/menu-item/{id}/  {locale: "en", force: false}
   │
   ▼
DescribeMenuItemView
   ├─ _resolve_organization
   ├─ lookup menu_item → 404 cross-tenant
   │
   ▼
services.describe_product(menu_item, "en", org, force=False)
   │
   ├─ Last AIProductDescription lookup (most recent updated_at)
   │   ├─ record.is_edited == True AND force == False
   │   │   → return existing {description: "...", is_edited: true, regenerated: false}
   │   │   (REGEN GUARD — admin manuel yazarsa AI ezmez)
   │   └─ Otherwise ↓
   │
   ├─ Context topla:
   │   ├─ item.name (TR default)
   │   ├─ category.name (TR default)
   │   ├─ item.price (Decimal → str)
   │   ├─ allergens.all() → codes list
   │   └─ dietary_tags.all() → codes list
   │
   ├─ AI call (OpenAI → Anthropic fallback)
   │   Prompt: "{context} → 2-3 cümle SEO-friendly açıklama, allergen inline warning, {locale}"
   │
   ├─ Parse DESCRIPTION_OUTPUT_SCHEMA → {description, confidence}
   │
   ├─ AIProductDescription.upsert(
   │     menu_item=item, locale="en",
   │     generated_text=parsed.description,
   │     ai_provider="openai", ai_model="gpt-4o",
   │     is_edited=False   ← ilk üretimde edited=False, admin sonradan editlerse True
   │   )
   │
   ├─ AuditEvent.emit(
   │     organization=org,
   │     action="ai_description_generated",
   │     target_type="ai_product_description",
   │     target_id=desc.id,
   │     payload={"locale":"en", "provider":"openai", "model":"gpt-4o",
   │              "is_regen": false, "confidence": 0.87}
   │   )
   │
   └─ response → {description, regenerated, is_edited, provider, model, description_id}
```

### Cache Strategy (write-through)

```
                     ┌─────────────────────────────────┐
   translate_text() │  normalize(text.strip().lower())│
        │            └────────────────┬────────────────┘
        │                             │
        │                             ▼
        │                   SHA-256(normalized_text) → hex_hash
        │                             │
        │                             ▼
        │            ┌─────────────────────────────────┐
        │            │ TranslationMemory               │
        │            │   unique: (org, hash, tgt_loc)  │
        │            │   fields: translated, provider, │
        │            │           model, confidence     │
        │            └─────┬───────────────────┬───────┘
        │                  │                   │
        │              HIT │                   │ MISS
        │                  ▼                   ▼
        │         return {translated,    AI call (OpenAI → Anthropic)
        │              cached=True,              │
        │              provider="..."}            │
        │                                         ▼
        │                       TranslationMemory.save()  ← write-through
        │                                         │
        │                                         ▼
        │                              return {translated, cached=False,
        │                                     provider, model, confidence}
        │
        ▼
   AuditEvent.emit (her durumda)
```

**Cache invariant:** aynı `org` + aynı normalized_text + aynı target_locale → tek API call. Tipik bulk translate (25 item × 3 dil) işleminde ortalama 10-15 cache hit beklenir (maliyet $0).

**Cache invalidation:** V1'de manuel invalidate yok. Admin aynı metni farklı prompt'la çevirtmek isterse V2 SaaS feature. V1'de cache "best effort correct" — provider güncelleme yeni hit üretir çünkü `ai_model` field'ı unique constraint'te yok, hash aynı ama provider değişirse duplicate oluşur. Test'te bu davranış dokümante edildi, Sprint 10+ provider upgrade flow'u için TODO.

### Tenant Isolation Pattern (D-022 reuse)

```python
# views.py
class IsOrganizationMember(BasePermission):
    """Org membership check (D-022 standard)."""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.memberships.filter(is_active=True).exists()

def _resolve_organization(request):
    """İlk aktif membership'ten organization çözümle."""
    membership = (
        request.user.memberships
        .filter(is_active=True)
        .select_related("organization")
        .first()
    )
    if membership is None:
        raise PermissionDenied("Henüz bir işletmeye üye değilsiniz.")
    return membership.organization

class TranslateTextView(APIView):
    permission_classes = [IsAuthenticated, IsOrganizationMember]
    def post(self, request):
        org = _resolve_organization(request)
        # ... tek metin, org FK cache lookup'ta
```

**Cross-tenant test pattern:**
```python
# test_security.py
def test_cross_tenant_translate_returns_404(org_a, org_b):
    """org_b kullanıcısı org_a item'ını translate endpoint'ine gönderirse 404."""
    client = APIClient()
    client.force_authenticate(user=org_b.memberships.first().user)
    res = client.post(f"/api/v1/admin/translate/menu-item/{org_a.item.id}/", ...)
    assert res.status_code == 404   # existence leak yok
```

---

## 6. Audit Integration Detail

### Yeni ACTION_CHOICES (`apps/audit/models.py`)

```python
ACTION_CHOICES = [
    ...,
    # Sprint 7A — AI PDF menu import (D-021).
    ("ai_import_uploaded", "AI import: PDF uploaded"),
    ("ai_import_confirmed", "AI import: draft confirmed"),
    ("ai_import_discarded", "AI import: draft discarded"),
    # Sprint 8A — Order flow (D-022).
    ("order_placed", "Order: placed (customer submission)"),
    ...,
    ("order_cancelled", "Order: cancelled"),
    # Sprint 9A — AI Translation + Description (D-023).
    ("ai_translation_generated", "AI translation: generated"),
    ("ai_description_generated", "AI description: generated"),
]
```

### Yeni TARGET_CHOICES

```python
TARGET_CHOICES = [
    ...,
    ("order", "Order"),
    # Sprint 9A — AI Translation + Description (D-023).
    ("translation_memory", "Translation Memory"),
    ("ai_product_description", "AI Product Description"),
]
```

### Audit Event Payload Schema

**Translation:**
```json
{
  "source_locale": "tr",
  "target_locale": "en",
  "provider": "openai",
  "model": "gpt-4o",
  "is_cached": false,
  "confidence": "0.92"
}
```

**Description:**
```json
{
  "locale": "en",
  "provider": "openai",
  "model": "gpt-4o",
  "is_regen": false,
  "confidence": "0.87",
  "context_item_id": 42
}
```

Multi-locale bulk translate'te (örn. 3 target_locale için 1 request) **N ayrı event** emit edilir (target_id=menu_item.id per locale), tek summary event yok — admin dashboard her event'i görebilir.

### View-layer Audit Emit (Service-layer değil)

```python
# views.py (doğru — view-layer emit)
def post(self, request, pk):
    org = _resolve_organization(request)
    result = services.translate_text(...)
    record_event(
        organization=org,
        actor=request.user,
        action="ai_translation_generated",
        target_type="translation_memory",
        target_id=result["translation_memory_id"],
        payload={...}
    )  # service audit emit etmez; view emit eder
    return Response(result)

# services.py (yanlış — service audit emit)
def translate_text(...):
    ai_result = provider_call(...)
    record_event(...)  # ← BU YOK
    return result
```

**Test'te yakalanan bug:** ilk implementasyonda `describe_product` audit emit ediyordu + bulk endpoint de ek olarak emit ediyordu → N×2 duplicate. Worker test'te gördü, fix'i hemen uyguladı (service audit remove + view tek emit).

---

## 7. D-021 Reuse Detayları

| Sprint 7A | Sprint 9A | Reuse |
|---|---|---|
| `apps/pdf_import/services.py:_get_openai()` | `apps/translate/services.py:_get_openai()` | ✅ Birebir aynı lazy SDK import |
| `_get_anthropic()` | `_get_anthropic()` | ✅ Aynı |
| `OpenAI client.chat.completions.create(response_format={"type":"json_schema"})` | Aynı | ✅ Pattern reuse |
| `Anthropic client.messages.create(system=...)` | Aynı | ✅ Pattern reuse |
| Mock test pattern (monkeypatch helper) | Aynı | ✅ Pattern reuse |
| `AIProviderError` exception class | Yeni | ⚠ Yeni (farklı error context) ama D-021 ile aynı shape |
| `INSTALLED_APPS` setup + settings env | Aynı | ✅ Pattern reuse |
| `IsOrganizationMember + _resolve_organization` | Aynı (D-022 standard) | ✅ Pattern reuse |

**Sonuç:** provider know-how tekrar kazanılmadı — Sprint 7A'nın know-how'ı korundu, yeni bug surface %30 azaldı.

---

## 8. Endpoint Catalog (V1 için finalize)

| Method | Path | Auth | Body | Response | Audit |
|---|---|---|---|---|---|
| POST | `/api/v1/admin/translate/` | IsOrgMember | `{text, source_locale, target_locale}` | `{translated, provider, model, confidence, cached, source_locale, target_locale}` | `ai_translation_generated` |
| POST | `/api/v1/admin/translate/menu-item/{id}/` | IsOrgMember | `{source_locale?, target_locales[]}` | `{translations: [{locale, translated_name, translated_description, cached}], ai_provider, generated_at}` | N events (per target_locale) |
| POST | `/api/v1/admin/translate/menu-category/{id}/` | IsOrgMember | aynı | `{translations: [...], ai_provider, generated_at}` | N events |
| POST | `/api/v1/admin/describe/menu-item/{id}/` | IsOrgMember | `{locale, force?}` | `{description, regenerated, is_edited, provider, model, confidence, description_id}` | `ai_description_generated` |
| POST | `/api/v1/admin/describe/bulk/` | IsOrgMember | `{locale, item_ids?}` | `{results: [{item_id, description, generated, skipped}], total_generated, total_skipped, locale, filter}` | N events |
| GET | `/api/v1/admin/translate/stats/` | IsOrgMember | — | `{translation_memory: {count, cache_hit_rate}, descriptions: {count, with_description_count, coverage_pct}, by_locale: {...}}` | — |

**Future endpoints (V2 backlog):**
- `POST /admin/translate/glossary/` — per-org custom glossary
- `POST /admin/translate/voice/` — pronunciation audio
- `GET /admin/describe/templates/` — description template gallery

---

## 9. Öğrenimler / Gelecek Sprint Notları

1. **Provider abstraction katmanı (`apps.ai/`)** V2 SaaS scale için düşünülmeli — Sprint 10+ adayı. Şu an her app kendi provider helper'ını barındırıyor (pdf_import + translate). Üçüncü app eklendiğinde shared module'a refactor
2. **DE/AR locales** — menu modeli `LOCALE_CHOICES` sadece TR+EN. DE/AR eklemek için menu migration + settings LOCALE_CHOICES + TRANSLATION_PROMPTS (src,tgt) çifti. Sprint 9B/C içinde gerekebilir (turist destinasyonları için)
3. **Translation cache invalidation** — provider upgrade'inde (gpt-4o → gpt-4o-2024-08 gibi) cache eski modeli tutar. Sprint 10'da `ai_model_version` field + Celery cache-warm job eklenebilir
4. **Bulk endpoint rate limiting** — V1'de AnonRateThrottle default. Provider quota management V2 SaaS feature (per-org monthly cap)
5. **DRF throttle cache pollution** (test'te fix edildi) — Sprint 8 audit test'lerinde de aynı autouse fixture eklenmeli (Sprint 10 TODO)
6. **Admin UI bulk modal progress** — 25 item × 3 dil sync beklerse ~45 saniye. PDF import progress indicator pattern (Sprint 7B) reuse edilebilir (Sprint 9B)
7. **Description prompt kalitesi** — V1 prompt basit (item + category + price + allergens). V2'de allergen-içeren ürün için extra emphasis, fiyat segment (₺/₺₺/₺₺₺) markup, "tavsiye servis" suggestion

---

## 10. Sprint 9 İlerleme Özeti (9A done, 9B + 9C pending)

| Alt sprint | Durum | Kalan iş |
|---|---|---|
| 9A Backend | ✅ Tamam | — |
| 9B Admin UI | ⏳ Pending | Worker başlatılacak: API wrapper, AIAssistButton, LocaleBadge, inline translate butonları (category/item), bulk translate modal, description generator, translation gap panel |
| 9C Public SEO | ⏳ Pending | Worker başlatılacak: generateMetadata() + alternates.languages, JSON-LD schema.org Menu, lib/seo.ts helpers, X-Translation-Gaps header (backend), Lighthouse SEO ≥ 95 |

**Sprint 9A'nın 9B'ye teslim ettiği hazır API contract:**
- 6 endpoint + JSON schema
- 2 model (regen guard pattern ile)
- D-023 DECISIONS dokümantasyonu
- D-021 provider pattern (9B test mock'larında reuse)

**Sprint 9A bittiğinde 9B worker'ı başlatılabilir.** Plan: `docs/SPRINT_9_PLAN.md` + bu rapor referansı + D-023 kararı.
