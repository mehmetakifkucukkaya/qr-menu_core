# Sprint 5 — QR + Media + Analytics — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 5 (2-3 gün, planlanan ~80-100 saat)
**Durum:** Planlandı → 5A (backend) worker başlatıldı, 5B (frontend) sonra
**Önceki:** Sprint 1+2+3A+3B-1+3B-2+4A+4B+4C ✅ (65 commit, 85 backend test, 3 servis healthy, V1 demo akışının backend + admin UI kısmı hazır)

## Amaç

QR kod üretimi, görsel yükleme (cloud storage kararı) ve analytics. Ürün gerçek kullanım hissine ulaşır. Public menü açıldığında analytics artar, admin dashboard'da temel metrikler görünür.

## Alınan Kararlar (D-001..D-016 + OP-11)

- **D-011:** Image upload = local `MEDIA_ROOT` (`/app/media/uploads/{org_id}/`). Cloud storage (S3/R2/Hetzner Storage Box) Sprint 6 veya V2'ye ertelendi.
- **D-016:** AuditEvent model + thread-local context pattern (QR scan events için yeniden kullanılır)
- **OP-8:** working_hours_json şeması (Sprint 2'de netleşti)

## Sprint 5 Parçaları

### Sprint 5A — Backend (worker şu an başlıyor, ~45-60 dk)

**Kapsam:**
1. `apps/qr/` — QRCode model + endpoints
2. `apps/media/` — Media upload endpoint
3. `apps/analytics/` — MenuViewEvent + public events endpoint + analytics overview endpoint
4. Backend test (QR + media + analytics, ~20+ test)

### Sprint 5B — Frontend (sonraki worker, ~45-60 dk)

**Kapsam:**
1. `/admin/qr-codes` — list + create + detail + download
2. `/admin/analytics` — dashboard kartları + basit chart (SVG)
3. `src/lib/events.ts` — public event tracker
4. `ImageUpload` component entegrasyonu — `/api/v1/admin/media/upload` ile multipart upload
5. `BusinessHero` + `ItemDetailDrawer` üzerinde WhatsApp/Phone click event'leri

## Backend Detay (5A)

### QRCode Model (`apps/qr/models.py`)

```python
class QRCode(models.Model):
    organization = FK(Organization, related_name='qr_codes')
    branch = FK(Branch, null=True, related_name='qr_codes')
    menu = FK(Menu, related_name='qr_codes')
    label = CharField(max 80)
    target_url = URLField(max 500)
    table_number = CharField(max 20, blank)
    scan_count = PositiveIntegerField(default 0)
    is_active = BooleanField(default True)
    created_at, updated_at

    class Meta:
        ordering = ['-created_at']
        indexes = [(organization, -created_at)]
```

### QR Endpoints (`apps/qr/views.py`)

```
GET    /api/v1/admin/qr-codes                  → list (tenant-scoped)
POST   /api/v1/admin/qr-codes                  → create
GET    /api/v1/admin/qr-codes/{id}             → retrieve
PATCH  /api/v1/admin/qr-codes/{id}             → update label/active
DELETE /api/v1/admin/qr-codes/{id}             → soft delete
GET    /api/v1/admin/qr-codes/{id}/download    → PNG response (image/png)
```

**Target URL generation:**
```python
def build_target_url(business_slug, branch_slug=None, qr_id=None):
    base = settings.PUBLIC_BASE_URL or "http://localhost:3000"
    url = f"{base}/m/{business_slug}"
    params = []
    if branch_slug:
        params.append(f"branch={branch_slug}")
    if qr_id:
        params.append(f"qr={qr_id}")
    if params:
        url += "?" + "&".join(params)
    return url
```

**PNG generation:**
```bash
pip install qrcode[pil]
```

```python
import qrcode
from io import BytesIO

def generate_qr_png(url: str) -> bytes:
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()
```

**PNG download endpoint:**
```python
def download(self, request, pk):
    qr_code = get_object_or_404(QRCode, pk=pk, organization=request.user.memberships.first().organization)
    png_bytes = generate_qr_png(qr_code.target_url)
    response = HttpResponse(png_bytes, content_type='image/png')
    response['Content-Disposition'] = f'attachment; filename="qr-{qr_code.id}.png"'
    return response
```

### Media Upload (`apps/media/views.py`)

```
POST /api/v1/admin/media/upload — multipart/form-data
  Body: file=<binary>
  Response: { data: { url, filename, size, content_type } }
```

**Validation:**
- Mime type: `image/jpeg`, `image/png`, `image/webp`
- Max size: 5 MB
- Extension whitelist: `.jpg`, `.jpeg`, `.png`, `.webp`
- Storage: `MEDIA_ROOT/uploads/{organization_id}/{uuid}-{filename}`

```python
ALLOWED_MIME = {'image/jpeg', 'image/png', 'image/webp'}
MAX_SIZE = 5 * 1024 * 1024

def upload(request):
    file = request.FILES.get('file')
    if not file:
        return Response({'error': {...}}, status=400)
    if file.content_type not in ALLOWED_MIME:
        return Response({'error': {'code': 'media.invalid_type'}}, status=400)
    if file.size > MAX_SIZE:
        return Response({'error': {'code': 'media.too_large'}}, status=400)
    org_id = request.user.memberships.first().organization_id
    ext = Path(file.name).suffix.lower()
    new_name = f"{uuid.uuid4()}{ext}"
    org_dir = Path(settings.MEDIA_ROOT) / 'uploads' / str(org_id)
    org_dir.mkdir(parents=True, exist_ok=True)
    path = org_dir / new_name
    with open(path, 'wb') as f:
        for chunk in file.chunks():
            f.write(chunk)
    url = f"{settings.PUBLIC_BASE_URL}/media/uploads/{org_id}/{new_name}"
    return Response({'data': {'url': url, 'filename': new_name, 'size': file.size, 'content_type': file.content_type}})
```

### MenuViewEvent Model (`apps/analytics/models.py`)

```python
class MenuViewEvent(models.Model):
    EVENT_CHOICES = [
        ('menu_view', 'Menu view'),
        ('language_change', 'Language change'),
        ('whatsapp_click', 'WhatsApp click'),
        ('phone_click', 'Phone click'),
        ('qr_open', 'QR scan'),
    ]
    organization = FK(Organization, related_name='view_events')
    branch = FK(Branch, null=True)
    menu = FK(Menu, null=True)
    qr_code = FK(QRCode, null=True)
    event_type = CharField(choices=EVENT_CHOICES)
    locale = CharField(max 5)
    path = CharField(max 500)
    user_agent_hash = CharField(max 64)  # sha256 hex
    ip_hash = CharField(max 64)  # sha256 hex (salt'lı)
    referrer = URLField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            (organization, '-created_at'),
            (organization, 'event_type', '-created_at'),
        ]
```

### Public Events Endpoint (`apps/analytics/views_public.py`)

```
POST /api/v1/public/events
  Body: {
    event_type: 'menu_view' | 'language_change' | 'whatsapp_click' | 'phone_click' | 'qr_open',
    locale: 'tr' | 'en',
    path: '/m/modern-cafe',
    qr_id: 123 (optional)
  }
  Response: 204 No Content
  Throttle: 30/min (AnonRateThrottle)
```

```python
import hashlib
from django.conf import settings

def hash_value(value, salt=None):
    salt = salt or settings.ANALYTICS_SALT
    return hashlib.sha256(f"{salt}:{value}".encode()).hexdigest()

def record_event(request, payload):
    org_slug = payload.get('organization_slug')  # URL'den veya implicit
    org = Organization.objects.filter(slug=org_slug, is_active=True).first()
    if not org:
        return Response(status=204)  # silent ignore
    ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip() or request.META.get('REMOTE_ADDR')
    ua = request.META.get('HTTP_USER_AGENT', '')
    MenuViewEvent.objects.create(
        organization=org,
        branch_id=payload.get('branch_id'),
        menu_id=payload.get('menu_id'),
        qr_code_id=payload.get('qr_id'),
        event_type=payload['event_type'],
        locale=payload.get('locale', 'tr'),
        path=payload.get('path', '/')[:500],
        user_agent_hash=hash_value(ua)[:64],
        ip_hash=hash_value(ip)[:64],
        referrer=request.META.get('HTTP_REFERER'),
    )
    return Response(status=204)
```

### Analytics Overview Endpoint (`apps/analytics/views_admin.py`)

```
GET /api/v1/admin/analytics/overview
  Query: ?days=30 (default 30)
  Response: {
    data: {
      today_views: 12,
      week_views: 78,
      month_views: 342,
      event_counts: {
        menu_view: 280,
        language_change: 25,
        whatsapp_click: 8,
        phone_click: 12,
        qr_open: 17
      },
      language_distribution: {'tr': 0.7, 'en': 0.3},
      top_qr_codes: [
        { id: 1, label: 'Kasa', scan_count: 17 },
        ...
      ],
      daily_views: [
        { date: '2026-09-20', count: 8 },
        ...
      ]
    }
  }
```

### Tests (`apps/analytics/tests/`)

- test_menu_view_event_creation
- test_event_ip_hash_not_stored_as_plain
- test_event_throttle_30_per_minute
- test_analytics_overview_counts
- test_analytics_tenant_isolation
- test_analytics_daily_aggregation
- test_analytics_language_distribution
- test_analytics_top_qr_codes

(`apps/qr/tests/`)
- test_qr_code_creation
- test_qr_target_url_format
- test_qr_png_download_returns_image_png
- test_qr_png_includes_target_url_data

(`apps/media/tests/`)
- test_media_upload_validates_mime_type
- test_media_upload_validates_size
- test_media_upload_stores_in_org_directory
- test_media_upload_returns_url

## Frontend Detay (5B) — Sprint 5B için

### QR Management (`/admin/qr-codes`)

- **List page**: tüm QR kodlar (label, menu, branch, table, scan_count, active toggle)
- **Create page**: form (label, menu select, branch select, table_number optional)
- **Detail page**: QR preview (large PNG via `<img src="/api/v1/admin/qr-codes/{id}/download" />`), label edit, target URL display, scan count
- **Download**: button click → fetch PNG → trigger browser download

### Public Event Tracker (`src/lib/events.ts`)

```typescript
export async function trackEvent(eventType: string, payload: Record<string, any> = {}): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/v1/public/events/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        locale: getLocale(),
        path: window.location.pathname,
        organization_slug: getOrgSlugFromPath(),
        ...payload,
      }),
    });
  } catch (err) {
    // silent fail — analytics never breaks UX
  }
}
```

### Analytics Dashboard (`/admin/analytics`)

- Stat cards: Bugün / 7 gün / 30 gün görüntülenme
- Event type bar chart (SVG, basit)
- Language distribution (pie chart SVG)
- Top 5 QR codes table

### Image Upload Integration

- ImageUpload component multipart POST ile `/api/v1/admin/media/upload`
- Preview: uploaded file URL (MEDIA URL)

## V1 Dışı (YAPMA)

Online ödeme, sipariş, mutfak ekranı, garson çağırma, POS, rezervasyon, müşteri hesabı, sadakat, AI menü import. Cloud storage (S3/R2) V1 sonrası. Recharts/Chart.js gibi chart kütüphaneleri V1'de kullanılmaz (basit SVG yeterli).

## Commit Stili (~6-8 backend commit)

- `chore(backend): qrcode library + apps/qr scaffold`
- `feat(qr): QRCode model + admin endpoints`
- `feat(qr): PNG download endpoint (qrcode lib)`
- `feat(media): upload endpoint + validation (mime, size, extension)`
- `feat(analytics): MenuViewEvent model`
- `feat(analytics): public events endpoint (IP/UA hash + throttle)`
- `feat(analytics): admin overview endpoint (today/week/month + breakdown)`
- `test(backend): qr + media + analytics tests (~20 test)`
- `chore(docs): DECISIONS D-017 + Sprint 5A report`

## Kabul Kriterleri (Sprint 5A)

✅ `POST /api/v1/admin/qr-codes` → 201 + target URL
✅ `GET /api/v1/admin/qr-codes/{id}/download` → 200 image/png (gerçek QR data içerir)
✅ QR PNG scanner ile açılınca target URL'e gider
✅ `POST /api/v1/admin/media/upload` (multipart) → 201 + {url, filename, size}
✅ Media upload invalid mime/size → 400 + error code
✅ `POST /api/v1/public/events` → 204 (throttle 30/min)
✅ Event IP/UA hash'li (DB'de plain IP yok)
✅ `GET /api/v1/admin/analytics/overview` → counts + breakdown + daily + lang dist + top QR
✅ pytest 105+ yeşil (85 + ~20 yeni)
✅ Tenant isolation: org A user org B events/qr/media göremez
✅ Commit'ler main'e push
✅ DECISIONS D-017 (analytics pattern)

## Auth Expire Riski

5A backend scope ~45-60 dakika. 90 dakika kuralı. Tamamlanmazsa:
- QR + Media upload minimum (analytics sonra)
- "Olduğu kadar commit'le, push'la, durumu raporla"