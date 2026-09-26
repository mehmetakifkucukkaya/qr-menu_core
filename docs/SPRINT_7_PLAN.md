# Sprint 7 — AI PDF Menu Import (V2 First Sprint) — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 7 (V2 ilk sprint, 2-3 gün, planlanan ~60-90 saat)
**Durum:** Planlandı → worker başlatılacak
**Önceki:** V1 fully complete ✅ (108 commit, 134 backend test, AI logo/kapak, prod config, docs)

## Amaç

Operatörün PDF menüsünü upload edip AI ile otomatik olarak kategori + ürün + fiyat + alerjen çıkarma; admin review/edit + bulk save ile menü oluşturma süresini **5 dakikadan 30 saniyeye** düşürmek. V1'de seed_demo ile yapılan manuel 25 ürün girişinin otomatik versiyonu.

## Açık Kararlar (Sprint 7 başında netleşecek)

| ID | Karar | Öneri | Gerekçe |
|---|---|---|---|
| **OP-12** | AI provider | OpenAI GPT-4o (primary) + Anthropic Claude 3.5 Sonnet (fallback) | GPT-4o multimodal zaten yaygın, Claude da güçlü; fallback provider zorunlu (rate limit / downtime) |
| **OP-13** | AI import format | Yapılandırılmış JSON output (schema ile), parse güvenliği için tool-use / function-calling | Validation katmanı, hatalı parse retry |
| **OP-14** | Draft model | `MenuImportDraft` model — operator review öncesi ayrı tabloda | Review + edit + bulk save atomik; partial success durumunda kurtarma |
| **OP-15** | Final model | Draft onay sonrası → mevcut Menu/Category/Item modellerine dönüşüm | V1 model'leri reuse, schema değişikliği yok |
| **OP-16** | PDF sayfa limiti | İlk sprint: max 20 sayfa, 10MB | Çoğu kafe/restoran menüsü 5-10 sayfa; limit aşılırsa operator'a uyarı |
| **OP-17** | Image extraction | V1'de yapma (PDF'ten image copy complexity, copyright). Sadece text + price extraction. | V2 ileri: opsiyonel image extraction |

## Sprint 7 Parçaları

### Sprint 7A — Backend (PDF upload + AI parsing, ~45-60 dk)

**Kapsam:**
- `apps/pdf_import/` — yeni app
- `MenuImportDraft` model (organization FK, status enum, ai_provider, ai_model, raw_pdf, parsed_data JSONField, error JSONField, created_at, updated_at)
- `MenuImportItem` (draft FK, sort_order, name, description, price, currency, allergens list, dietary_tags list, category_name, raw_text, confidence, is_edited)
- PDF upload endpoint: POST /api/v1/admin/pdf-import/upload (multipart, mime=application/pdf, max 10MB)
- AI parsing job: OpenAI GPT-4o call (vision, file_id upload, structured output schema)
- Anthropic Claude fallback (rate limit / error durumunda)
- Parse sonucu → MenuImportDraft + MenuImportItem rows
- POST /api/v1/admin/pdf-import/{draft_id}/confirm — bulk save to Menu/Category/Item
- DELETE /api/v1/admin/pdf-import/{draft_id} — discard draft
- Tenant-scoped (IsOrganizationMember)
- AuditEvent integration (ai_import_uploaded, ai_import_confirmed, ai_import_discarded)
- Backend test (~15 test)

### Sprint 7B — Frontend (admin UI, ~45-60 dk)

**Kapsam:**
- `/admin/pdf-import` sayfa — liste (geçmiş importlar)
- `/admin/pdf-import/new` sayfa — upload + AI progress + preview
- Preview table: kategori başına gruplanmış ürün listesi, inline edit (name, description, price, allergens, tags)
- Toplu kaydet (Confirm) butonu
- Frontend API wrappers
- Frontend build + lint temiz

## Backend Detay (Sprint 7A)

### Domain Model

```python
# apps/pdf_import/models.py

class MenuImportDraft(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending upload'),
        ('parsing', 'AI parsing in progress'),
        ('parsed', 'Parsed, awaiting review'),
        ('confirmed', 'Confirmed, items saved'),
        ('discarded', 'Discarded'),
        ('failed', 'Parse failed'),
    ]
    organization = FK(Organization, related_name='import_drafts')
    created_by = FK(User, null=True, related_name='import_drafts')
    status = CharField(choices=STATUS_CHOICES, default='pending')
    ai_provider = CharField(max 30)  # 'openai' | 'anthropic'
    ai_model = CharField(max 80)
    raw_pdf_filename = CharField(max 200)
    raw_pdf_size_bytes = PositiveIntegerField()
    parsed_data = JSONField(default=dict, blank=True)  # {categories: [...], items: [...]}
    error = JSONField(default=dict, blank=True)  # {code, message}
    confidence_avg = DecimalField(decimal_places=2, max_digits=4, null=True)
    created_at, updated_at

    class Meta:
        ordering = ['-created_at']

class MenuImportItem(models.Model):
    draft = FK(MenuImportDraft, related_name='items')
    sort_order = PositiveIntegerField(default=0)
    category_name = CharField(max 80)  # raw category name from PDF
    name = CharField(max 120)
    description = TextField(blank=True)
    price = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    currency = CharField(max 3, default='TRY')
    allergens = JSONField(default=list)  # ['gluten', 'dairy']
    dietary_tags = JSONField(default=list)  # ['vegan', 'popular']
    raw_text = TextField()  # raw PDF line
    confidence = DecimalField(decimal_places=2, max_digits=4, default=1.0)  # 0.00-1.00
    is_edited = BooleanField(default=False)  # admin review'de değişti mi
```

### AI Integration

```python
# apps/pdf_import/services.py
import openai
import base64
import json

OPENAI_API_KEY = settings.OPENAI_API_KEY
ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY

PARSING_SCHEMA = {
    "type": "object",
    "properties": {
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Category name in original language"},
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "price": {"type": "number"},
                                "currency": {"type": "string"},
                                "allergens": {"type": "array", "items": {"type": "string"}},
                                "dietary_tags": {"type": "array", "items": {"type": "string"}},
                                "raw_text": {"type": "string"},
                                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
                            }
                        }
                    }
                }
            }
        }
    }
}

async def parse_menu_pdf(pdf_path: str, organization: Organization) -> dict:
    """Parse PDF using OpenAI GPT-4o with structured output."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not configured")
    
    # Upload PDF to OpenAI
    with open(pdf_path, 'rb') as f:
        file_obj = openai.files.create(file=f, purpose='vision')
    
    try:
        # Vision API call with structured output
        response = openai.chat.completions.create(
            model='gpt-4o',
            messages=[
                {
                    "role": "system",
                    "content": "Sen bir restoran menüsü PDF'ini yapılandırılmış JSON'a çeviren bir AI asistanısın. Kategorileri, ürünleri, fiyatları, alerjenleri ve diyet etiketlerini tespit et. Çıktıyı SADECE JSON schema'ya uygun olarak ver, başka metin ekleme."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Bu PDF menüsünü analiz et ve JSON schema'ya uygun olarak parse et."},
                        {"type": "file", "file_id": file_obj.id}
                    ]
                }
            ],
            response_format={"type": "json_schema", "json_schema": {"name": "menu", "schema": PARSING_SCHEMA}}
        )
        
        result = json.loads(response.choices[0].message.content)
        return result
    finally:
        # Cleanup uploaded file
        openai.files.delete(file_obj.id)


async def parse_menu_pdf_anthropic_fallback(pdf_path: str) -> dict:
    """Fallback: Anthropic Claude 3.5 Sonnet."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not configured")
    
    with open(pdf_path, 'rb') as f:
        pdf_data = base64.standard_b64encode(f.read()).decode('utf-8')
    
    response = anthropic.messages.create(
        model='claude-3-5-sonnet-20241022',
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "document", "source": {"type": "base64", "media_type": "application/pdf", "data": pdf_data}},
                    {"type": "text", "text": "Bu PDF menüsünü analiz et ve JSON schema'ya uygun olarak parse et: " + json.dumps(PARSING_SCHEMA)}
                ]
            }
        ]
    )
    
    return json.loads(response.content[0].text)
```

### Backend Endpoints

```
POST /api/v1/admin/pdf-import/upload
  Body: multipart/form-data, file=<pdf>
  Response: 201 { data: { draft_id, status, ai_provider, ai_model } }
  
GET /api/v1/admin/pdf-import/drafts
  Response: { data: [drafts] }

GET /api/v1/admin/pdf-import/drafts/{id}
  Response: { data: { draft + items } }

PATCH /api/v1/admin/pdf-import/items/{id}
  Body: { name?, description?, price?, allergens?, dietary_tags? }
  Response: { data: { item } }

POST /api/v1/admin/pdf-import/drafts/{id}/confirm
  Body: { menu_id, default_locale, currency, is_active }
  Response: 200 { data: { draft, created: { menus, categories, items } } }

DELETE /api/v1/admin/pdf-import/drafts/{id}
  Response: 204
```

### Confirm Logic

```python
def confirm_draft(draft, user, **options):
    """Bulk save parsed items to existing Menu/Category/Item models."""
    menu = Menu.objects.create(
        organization=draft.organization,
        name=options['menu_name'],
        default_locale=options.get('default_locale', 'tr'),
        is_active=options.get('is_active', True),
    )
    
    # Group items by category_name
    by_category = {}
    for item in draft.items.all().order_by('category_name', 'sort_order'):
        by_category.setdefault(item.category_name, []).append(item)
    
    # Create categories + items atomically (transaction)
    with transaction.atomic():
        for sort_order, (cat_name, items) in enumerate(by_category.items()):
            category = MenuCategory.objects.create(
                menu=menu,
                name=cat_name,
                sort_order=sort_order,
                is_active=True,
            )
            for item_sort, item in enumerate(items):
                MenuItem.objects.create(
                    menu=menu,
                    category=category,
                    name=item.name,
                    description=item.description,
                    price=item.price,
                    currency=item.currency,
                    sort_order=item_sort,
                    is_active=True,
                )
    
    draft.status = 'confirmed'
    draft.save()
    
    # Audit
    AuditEvent.record(
        organization=draft.organization,
        actor=user,
        action='ai_import_confirmed',
        target_type='menu',
        target_id=menu.id,
        target_repr=f'{menu.name} (PDF import)',
        payload={'draft_id': draft.id, 'item_count': draft.items.count()},
    )
    
    return menu
```

### Tests (~15 test)

```
apps/pdf_import/tests/test_upload.py:
  - test_pdf_upload_valid_size
  - test_pdf_upload_invalid_mime_rejected
  - test_pdf_upload_creates_draft_pending
  - test_pdf_upload_size_limit
  - test_pdf_upload_tenant_scoped

apps/pdf_import/tests/test_parsing.py (mocked AI):
  - test_parsing_with_openai_success
  - test_parsing_with_anthropic_fallback_on_openai_error
  - test_parsing_creates_items_with_confidence
  - test_parsing_handles_unknown_category
  - test_parsing_invalid_response_keeps_draft_failed

apps/pdf_import/tests/test_confirm.py:
  - test_confirm_bulk_save_creates_menu_and_categories
  - test_confirm_atomic_transaction_rollback_on_error
  - test_confirm_creates_audit_event
  - test_confirm_invalidates_other_drafts
  - test_confirm_preserves_edited_items
```

## Frontend Detay (Sprint 7B)

### Pages

- `/admin/pdf-import` — list (geçmiş import drafts)
- `/admin/pdf-import/new` — upload + AI progress + preview
- `/admin/pdf-import/drafts/[id]` — review/edit + confirm

### Components

- `PdfUploadDropzone.tsx` — drag-drop PDF (max 10MB, mime check)
- `ParseProgressIndicator.tsx` — "Yükleniyor → AI analiz ediyor → Tamamlandı"
- `ImportPreviewTable.tsx` — kategori başına gruplanmış editable table
- `ImportItemRow.tsx` — single editable item row
- `ConfirmDialog` (Sprint 4B'den reuse)

### API Wrappers (`lib/api-admin.ts`)

```typescript
export interface MenuImportDraft {
  id: number;
  status: 'pending' | 'parsing' | 'parsed' | 'confirmed' | 'discarded' | 'failed';
  ai_provider: string;
  ai_model: string;
  raw_pdf_filename: string;
  raw_pdf_size_bytes: number;
  confidence_avg: number | null;
  items: MenuImportItem[];
  created_at: string;
  updated_at: string;
}

export interface MenuImportItem {
  id: number;
  sort_order: number;
  category_name: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  allergens: string[];
  dietary_tags: string[];
  raw_text: string;
  confidence: number;
  is_edited: boolean;
}

export async function uploadPdfImport(file: File): Promise<{ draft_id: number; status: string }>;
export async function fetchImportDrafts(): Promise<MenuImportDraft[]>;
export async function fetchImportDraft(id: number): Promise<MenuImportDraft>;
export async function updateImportItem(id: number, payload: Partial<MenuImportItem>): Promise<MenuImportItem>;
export async function confirmImportDraft(id: number, payload: ConfirmPayload): Promise<MenuImportDraft>;
export async function discardImportDraft(id: number): Promise<void>;
```

### UX Flow

1. Admin → `/admin/pdf-import` → "Yeni PDF Import" butonu
2. `/admin/pdf-import/new` → drag-drop PDF → AI progress → preview
3. Preview: kategori başına gruplanmış editable table
4. Admin her satırda inline edit yapabilir (name, description, price, allergens, tags)
5. "Onayla ve Kaydet" → modal (menu name + active toggle) → Confirm
6. → `/admin/menus` (yeni menu görünür)
7. Public'te `/m/{business_slug}` zaten mevcut menüleri gösterir

## V1 Dışı (YAPMA)

PDF'ten image extraction (V2 ileri), handwritten menu OCR (V2 ileri), QR import, multi-language import (V2 ileri: önce TR/EN, sonra diğer diller). Real-time progress (V1'de polling yeterli). Image-aware parsing (V2 ileri: görsel menüden fotoğrafı kopyala).

## Commit Stili

**Sprint 7A (~10-12 commit):**
- `chore(backend): openai + anthropic SDK + pdf_import app scaffold`
- `feat(pdf_import): MenuImportDraft + MenuImportItem models`
- `feat(pdf_import): PDF upload endpoint + validation`
- `feat(pdf_import): OpenAI GPT-4o integration + structured output`
- `feat(pdf_import): Anthropic Claude fallback`
- `feat(pdf_import): parsing service (provider abstraction + retry)`
- `feat(pdf_import): confirm bulk save + audit event`
- `feat(pdf_import): discard endpoint`
- `test(backend): pdf_import tests (~15 test, mocked AI)`
- `chore(docs): DECISIONS D-021 (AI provider + draft pattern)`
- `chore(ops): .env.example'a OPENAI_API_KEY + ANTHROPIC_API_KEY ekle`

**Sprint 7B (~5-7 commit):**
- `feat(frontend): PDF upload dropzone + parse progress`
- `feat(frontend): import preview table + inline edit`
- `feat(frontend): confirm dialog + bulk save flow`
- `feat(frontend): sidebar PDF Import link + API wrappers`
- `chore(docs): Sprint 7B report`

## V1 Dışı (YAPMA)

Online ödeme, sipariş, mutfak ekranı, garson çağırma, POS, rezervasyon, müşteri hesabı, sadakat, multi-org tenant switcher, cloud storage, JWT auth.

## Kabul Kriterleri (Toplam Sprint 7)

### Backend (7A)
✅ PDF upload (mime validation, size limit, tenant-scoped)
✅ OpenAI GPT-4o integration (structured output)
✅ Anthropic Claude fallback (provider switch on error)
✅ Parse → MenuImportDraft + items + confidence scores
✅ Confirm bulk save (atomic transaction)
✅ Audit events (ai_import_uploaded, ai_import_confirmed, ai_import_discarded)
✅ Discard endpoint
✅ pytest 134+15 = 149 yeşil
✅ Backend test 134 → 149 toplam

### Frontend (7B)
✅ `/admin/pdf-import/new` — drag-drop upload + AI progress
✅ `/admin/pdf-import/drafts/{id}` — preview table + inline edit
✅ "Onayla ve Kaydet" → modal → Confirm → yeni menu `/admin/menus`'da
✅ Sidebar PDF Import link
✅ npm run build + lint + tsc temiz
✅ Manual smoke: Modern Cafe demo PDF → import → menu oluşur

### Genel
✅ DECISIONS D-021 (AI provider + draft pattern + fallback)
✅ .env.example + .env.production.example'da OPENAI_API_KEY + ANTHROPIC_API_KEY
✅ Commit'ler main'e push

## Auth Expire Riski

7A backend büyük scope (~45-60 dk). 90 dakika kuralı.

Tamamlanmazsa scope'u daralt:
- Öncelik 1: PDF upload + OpenAI integration (V2'nin core value'u)
- Öncelik 2: Confirm bulk save (operator için critical UX)
- Öncelik 3: Anthropic fallback (production için önemli ama demo'da OpenAI yeterli)
- Öncelik 4: Discard endpoint (nice-to-have)

7B frontend ~45-60 dk. Auth expire olursa parçalanır.

## Notlar

- OpenAI API key environment variable'dan: `OPENAI_API_KEY`
- Anthropic API key: `ANTHROPIC_API_KEY`
- OpenAI Files API PDF'i kalıcı saklamaz (response sonrası silinir)
- GPT-4o vision üzerinden PDF'i işler (text extraction değil, vision)
- Schema validation Pydantic ile (`apps.pdf_import.schemas.ParsedMenu`)
- Eğer API key yoksa development'te `requirements-dev.txt`'e `responses` mock eklenebilir (V2 ileri)
- AI'dan dönen confidence < 0.5 olan item'lar admin'e kırmızı ile vurgulanır
- OCR için Tesseract fallback V2 ileri — V1'de sadece PDF digital text
- 7A sonunda 7B başlayacak (frontend admin UI)
- 7B sonrası V2 demo akışı: "PDF upload → AI parse → review → menu live" — demo için etkileyici