# Sprint 7A Report — AI PDF Menu Import (Backend)

**Tarih:** 2026-09-26
**Sprint:** 7A (V2 ilk sprint, backend)
**Durum:** ✅ Tamamlandı
**Sonraki:** Sprint 7B (frontend admin UI)

---

## Özet

Operatörün PDF menüsünü upload edip OpenAI GPT-4o (primary) + Anthropic Claude 3.5 Sonnet (fallback) ile otomatik parse eden, sonra admin review/edit + bulk-save ile canlı menüye dönüştüren backend akışı tamamlandı. V2'nin core value'u olan "5 dakikadan 30 saniyeye menü oluşturma" akışının sunucu tarafı hazır.

---

## Kabul Kriteri Checklist

| Kriter | Durum | Kanıt |
|---|---|---|
| PDF upload (mime=application/pdf, max 10MB) | ✅ | `test_upload_invalid_mime_returns_400`, `test_upload_too_large_returns_400` |
| Tenant-scoped (IsOrganizationMember) | ✅ | `test_upload_tenant_scoped_writes_to_uploader_org`, `test_drafts_list_tenant_scoped` |
| OpenAI GPT-4o structured output çalışır (mocked test) | ✅ | `test_parsing_openai_success` |
| Anthropic fallback OpenAI hata verirse devreye girer | ✅ | `test_parsing_anthropic_fallback_on_openai_error` |
| Parse → MenuImportDraft + MenuImportItem rows | ✅ | `test_upload_valid_pdf_creates_draft_parsing_status` |
| Confidence scores kaydedilir | ✅ | `confidence_avg` decimal + per-item `confidence` |
| Confirm bulk save (atomic transaction) | ✅ | `test_confirm_bulk_save_creates_menu_and_categories`, `test_confirm_atomic_rollback_on_error` |
| Audit events (ai_import_uploaded, ai_import_confirmed, ai_import_discarded) | ✅ | `test_upload_creates_audit_event`, `test_confirm_creates_audit_event`, `test_discard_creates_audit_event` |
| Drafts list + detail endpoints | ✅ | `test_drafts_list_*`, `test_draft_detail_*` |
| Item update endpoint (is_edited flag) | ✅ | `test_item_update_marks_edited`, `test_item_update_unknown_field_returns_400` |
| Discard endpoint | ✅ | `test_discard_marks_status`, `test_discard_wrong_status_returns_400` |
| pytest 134 + 37 = 171 yeşil | ✅ | `171 passed, 1 skipped` |
| Commit'ler main'e push | ✅ | Sprint 7A commit'leri push edildi |
| DECISIONS D-021 | ✅ | `DECISIONS.md` §D-021 |

---

## Oluşturulan / Değiştirilen Dosyalar

### Backend (yeni)

| Dosya | Açıklama |
|---|---|
| `backend/apps/pdf_import/__init__.py` | App docstring + module init |
| `backend/apps/pdf_import/apps.py` | `PdfImportConfig` |
| `backend/apps/pdf_import/models.py` | `MenuImportDraft` + `MenuImportItem` + QuerySet'ler |
| `backend/apps/pdf_import/schemas.py` | `MENU_PARSE_SCHEMA`, `SYSTEM_PROMPT`, `EDITABLE_FIELDS` |
| `backend/apps/pdf_import/services.py` | `parse_menu_pdf()` orchestrator + `_parse_with_openai()` + `_parse_with_anthropic()` + `confirm_draft()` |
| `backend/apps/pdf_import/views.py` | 6 endpoint (upload, drafts list/detail, item update, confirm, discard) |
| `backend/apps/pdf_import/urls.py` | 6 URL pattern |
| `backend/apps/pdf_import/admin.py` | Django admin (read-only viewer) |
| `backend/apps/pdf_import/migrations/__init__.py` | Migration package |
| `backend/apps/pdf_import/migrations/0001_initial.py` | Yeni modeller + 3 index |
| `backend/apps/pdf_import/tests/__init__.py` | Test package |
| `backend/apps/pdf_import/tests/conftest.py` | Auth fixtures + PDF bytes + parsed_draft + sample_openai_response |
| `backend/apps/pdf_import/tests/test_upload.py` | 7 test |
| `backend/apps/pdf_import/tests/test_parsing.py` | 7 test (mocked AI) |
| `backend/apps/pdf_import/tests/test_confirm.py` | 9 test |
| `backend/apps/pdf_import/tests/test_views.py` | 14 test |

### Backend (değiştirilen)

| Dosya | Değişiklik |
|---|---|
| `backend/requirements.txt` | + openai==1.54.0, anthropic==0.36.2, pypdf==5.1.0 |
| `backend/config/settings/base.py` | + `apps.pdf_import` INSTALLED_APPS, + AI settings (OPENAI_API_KEY, OPENAI_DEFAULT_MODEL, ANTHROPIC_API_KEY, ANTHROPIC_DEFAULT_MODEL), + PDF guardrails |
| `backend/config/urls.py` | + `/api/v1/admin/pdf-import/` mount |
| `backend/apps/audit/models.py` | + 3 yeni ACTION_CHOICES (ai_import_uploaded, ai_import_confirmed, ai_import_discarded), + 1 yeni TARGET_CHOICES (menu_import_draft), target_type max_length 20 → 30 |
| `backend/apps/audit/migrations/0002_alter_auditevent_action_alter_auditevent_target_type.py` | Yeni migration |

### Repo root (değiştirilen)

| Dosya | Değişiklik |
|---|---|
| `.env.example` | + AI key env blok (OPENAI_API_KEY, OPENAI_DEFAULT_MODEL, ANTHROPIC_API_KEY, ANTHROPIC_DEFAULT_MODEL) |
| `.env.production.example` | + AI key env blok + `__SET_IN_PRODUCTION__` placeholder |
| `DECISIONS.md` | + D-021 — AI PDF Menu Import Pattern (~80 satır) |

### Docs (yeni)

| Dosya | Açıklama |
|---|---|
| `docs/SPRINT_7A_REPORT.md` | Bu rapor |

---

## Doğrulama Komut Çıktıları

### Test suite

```bash
$ cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest tests/ apps/ -q
```

```
171 passed, 1 skipped, 1 warning in 2.50s
```

- 134 V1 test (regression — hepsi yeşil)
- 37 yeni pdf_import test
- 1 analytics throttle test skip pattern (Sprint 4A)

### pdf_import tests breakdown

```
apps/pdf_import/tests/test_upload.py        — 7 PASSED
apps/pdf_import/tests/test_parsing.py       — 7 PASSED
apps/pdf_import/tests/test_confirm.py       — 9 PASSED
apps/pdf_import/tests/test_views.py         — 14 PASSED
```

### Migration

```bash
$ python3 manage.py makemigrations pdf_import audit
Migrations for 'pdf_import':
  apps/pdf_import/migrations/0001_initial.py
Migrations for 'audit':
  apps/audit/migrations/0002_alter_auditevent_action_alter_auditevent_target_type.py

$ python3 manage.py migrate
  Applying audit.0002_alter_auditevent_action_alter_auditevent_target_type... OK
  Applying pdf_import.0001_initial... OK
  ...
```

### Ruff (lint gate)

```bash
$ ruff check apps/pdf_import/ --select F,E
All checks passed!
```

E/F seviyesinde (syntax + undefined name + unused import) temiz. RUF012 (DRF mutable defaults pattern) ve RUF001 (Türkçe karakterler — 'ı' vs 'i') pre-existing false positive pattern; V1'in diğer app'lerinde de mevcut, CI gate'inde değil.

---

## Commit Listesi

7A kapsamında üretilen commit'ler:

```
chore(backend): openai + anthropic SDK + pdf_import app scaffold
feat(pdf_import): MenuImportDraft + MenuImportItem models
feat(pdf_import): PDF upload endpoint + validation
feat(pdf_import): OpenAI GPT-4o integration + structured output
feat(pdf_import): Anthropic Claude fallback
feat(pdf_import): parsing service (provider abstraction + retry)
feat(pdf_import): confirm bulk save + audit event
feat(pdf_import): discard endpoint + drafts list/detail
feat(pdf_import): item update endpoint (mark as edited)
test(backend): pdf_import tests (37 test, mocked AI)
chore(ops): .env.example + .env.production.example'a AI keys ekle
chore(docs): DECISIONS D-021
```

---

## AI Provider Fallback Pattern

```python
# services.py (özet)
def parse_menu_pdf(pdf_path: str) -> tuple[str, str, dict]:
    """OpenAI primary, Anthropic fallback."""
    last_error: Exception | None = None
    try:
        return _parse_with_openai(pdf_path)
    except (OpenAIParseError, Exception) as exc:
        last_error = exc
        if not settings.ANTHROPIC_API_KEY:
            raise AIProviderError(
                f"OpenAI başarısız ve Anthropic yapılandırılmamış: {exc}"
            ) from exc
    try:
        return _parse_with_anthropic(pdf_path)
    except (AnthropicParseError, Exception) as exc:
        raise AIProviderError(
            f"Her iki sağlayıcı da başarısız: openai={last_error!r}, anthropic={exc!r}"
        ) from exc
```

**Akış:**

1. `PdfUploadView.post()` → PDF'i `MEDIA_ROOT/pdf_imports/{org_id}/{uuid}.pdf`'e yazar
2. `parse_menu_pdf(pdf_path)` çağrılır
3. **OpenAI denenir** (`gpt-4o`, structured JSON output):
   - `client.files.create(purpose="vision")` ile PDF yüklenir
   - `chat.completions.create(response_format={"type": "json_schema"})` ile constrained JSON
   - Yanıt parse edilir; schema uyuşmazsa `OpenAIParseError`
   - finally'de `client.files.delete()` ile uploaded file temizlenir
4. **OpenAI hata verirse** → Anthropic (`claude-3-5-sonnet-20241022`) fallback:
   - PDF base64 + document content block
   - Schema prompt'un içinde verilir (constrained output yok)
   - Markdown fence'leri (` ```json ... ``` `) temizlenir
5. **İkisi de başarısız** → `AIProviderError` raise → endpoint `502 ai.parse_failed`

**SDK lazy-load:** Test'lerde `services._get_openai()` / `_get_anthropic()` mock'lanır. Production'da ilk çağrıda SDK import edilir, sonra cache.

**Test coverage:**

- `test_parsing_openai_success` — happy path
- `test_parsing_anthropic_fallback_on_openai_error` — primary error → secondary success
- `test_parsing_fails_when_both_providers_unavailable` — both fail → AIProviderError
- `test_parsing_handles_invalid_json_response` — OpenAI non-JSON → error
- `test_parsing_handles_missing_categories_key` — OpenAI valid JSON but wrong shape
- `test_parsing_anthropic_strips_markdown_fence` — Anthropic fenced JSON
- `test_parsing_no_keys_configured` — no API keys → 502

---

## Status Machine

```
                    ┌─────────────────┐
                    │  POST /upload   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │     parsing     │ (status: parsing)
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
   AI success  │   AI fail    │   Other errors
              │              │              │
       ┌──────▼─────┐  ┌─────▼──────┐  ┌────▼─────┐
       │   parsed   │  │   failed   │  │ (rollback│
       │            │  │ (terminal) │  │  to failed)
       └──────┬─────┘  └────────────┘  └──────────┘
              │
       ┌──────┴──────┐
       │             │
  PATCH items   POST /confirm    DELETE /discard
       │             │                  │
  (inline edit) ┌────▼─────┐       ┌─────▼─────┐
       │        │confirmed │       │ discarded │
       │        │ (terminal)      │ (terminal)│
       │        └──────────┘       └───────────┘
       │ (status stays 'parsed' until confirm)
```

**Invariant:** `pending / parsing / parsed / failed` → discardable. `confirmed / discarded` are terminal (cannot edit, cannot discard, cannot re-parse).

---

## Sprint 7B (Frontend) Hazırlık Notu

7B'de (admin UI) implementasyonu için gerekli API kontratı:

### Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/v1/admin/pdf-import/upload/` | multipart `file=<pdf>` | `201 {data: {draft_id, status, ai_provider, ai_model, item_count, confidence_avg}}` |
| GET | `/api/v1/admin/pdf-import/drafts/` | — | `200 {data: [drafts]}` (last 20, newest first) |
| GET | `/api/v1/admin/pdf-import/drafts/{id}/` | — | `200 {data: {draft + items[]}}` |
| PATCH | `/api/v1/admin/pdf-import/items/{id}/` | `{name?, description?, price?, allergens?, dietary_tags?, category_name?}` | `200 {data: {id, is_edited, name, category_name, price}}` |
| POST | `/api/v1/admin/pdf-import/drafts/{id}/confirm/` | `{menu_name, default_locale?, is_active?}` | `200 {data: {menu_id, category_count, item_count}}` |
| DELETE | `/api/v1/admin/pdf-import/drafts/{id}/discard/` | — | `204` |

### Error codes (frontend'in handle etmesi gereken)

- `pdf.required` (400) — file alanı yok
- `pdf.invalid_mime` (400) — application/pdf değil
- `pdf.too_large` (400) — 10 MB üstü
- `pdf.no_organization` (403) — kullanıcı hiçbir org'a üye değil
- `ai.parse_failed` (502) — her iki AI provider başarısız
- `draft.not_found` (404)
- `draft.not_confirmable` (400) — status != parsed
- `draft.not_discardable` (400) — terminal state
- `item.not_found` (404)
- `item.not_editable` (400) — draft.status != parsed
- `item.unknown_field` (400) — whitelist dışı alan
- `item.no_changes` (400)
- `item.invalid_payload` (400)
- `menu_name.required` (400)

### UI Bileşenleri (7B scope)

- `PdfUploadDropzone.tsx` — drag-drop PDF (max 10 MB, mime check client-side da)
- `ParseProgressIndicator.tsx` — "Yükleniyor → AI analiz ediyor → Tamamlandı"
- `ImportPreviewTable.tsx` — kategori başına gruplanmış editable table
- `ImportItemRow.tsx` — single editable item row
- `ConfirmDialog` (Sprint 4B'den reuse — menu_name + active toggle)

### Frontend API Wrappers (`apps/web/lib/api-admin.ts`)

```typescript
export async function uploadPdfImport(file: File): Promise<UploadResult>;
export async function fetchImportDrafts(): Promise<MenuImportDraft[]>;
export async function fetchImportDraft(id: number): Promise<MenuImportDraftDetail>;
export async function updateImportItem(id: number, payload: Partial<MenuImportItem>): Promise<MenuImportItem>;
export async function confirmImportDraft(id: number, payload: ConfirmPayload): Promise<ConfirmResult>;
export async function discardImportDraft(id: number): Promise<void>;
```

### Confidence highlight

Frontend'de `confidence < 0.5` olan satırlar kırmızı background ile vurgulanır. Backend sadece skor verir, UX kararı 7B'de.

### Sidebar link

`apps/web/components/admin/Sidebar.tsx` (veya eşdeğeri) — "PDF Import" linki admin sidebar'a eklenir, `/admin/pdf-import` route'una yönlendirir.

### Demo akışı (7B sonrası uçtan uca)

1. Admin → `/admin/pdf-import` → "Yeni PDF Import" butonu
2. `/admin/pdf-import/new` → drag-drop `modern-cafe-menu.pdf`
3. AI progress (1-3 sn) → preview: 2 kategori + 3 ürün
4. Admin Türk Kahvesi'nin price'ını düzenler (45 → 50)
5. "Onayla ve Kaydet" → modal → menu_name="Modern Cafe Eylül 2026"
6. → `/admin/menus` (yeni menü görünür)
7. Public'te `/m/modern-cafe` zaten canlı menüde gösterir

---

## Sprint 7A Notlar

- 90 dakikalık auth-expire limitine karşı tüm scope tamamlandı (öncelik sırasına göre hepsi 1. derece)
- Mocked AI test'ler CI'da API key gerektirmez; gerçek parse için `.env`'e key koymak yeterli
- pypdf dependency pinlendi ama henüz kullanılmıyor (V2 OCR fallback backlog)
- OpenAI Files API uploaded file'ı her parse sonrası silinir (`client.files.delete()`) — 30 gün retention yerine 0
- DRF throttle + audit middleware zaten kurulu; yeni endpoint'ler inherit ediyor
- Django admin `/admin/pdf_import/` adresinden read-only görüntülenebilir (superuser için)