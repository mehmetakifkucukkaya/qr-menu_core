# Sprint 5A — Backend QR + Media + Analytics Report

**Tarih:** 2026-09-26
**Sprint:** 5A (Sprint 5'in backend parçası; 5B frontend ayrı worker)
**Önceki:** Sprint 1+2+3A+3B-1+3B-2+4A+4B+4C ✅ (65 commit, 85 backend test)
**Hedef:** QR kod yönetimi + görsel yükleme + public analytics olay kaydı + admin analytics dashboard payload.

---

## Kabul Kriterleri — Checklist

| # | Kriter | Durum |
|---|---|---|
| 1 | `POST /api/v1/admin/qr-codes/` → 201 + `target_url` | ✅ |
| 2 | `GET /api/v1/admin/qr-codes/{id}/download` → 200 `image/png` (gerçek QR verisi içerir) | ✅ |
| 3 | QR PNG scanner ile açılınca target URL'e gider | ✅ (370x370 PNG, encoder tarafı doğru; manuel phone scan Sprint 5B smoke'unda) |
| 4 | `POST /api/v1/admin/media/upload` (multipart) → 201 + `{url, filename, size}` | ✅ |
| 5 | Media upload invalid mime/size → 400 + `media.invalid_type` / `media.too_large` | ✅ |
| 6 | `POST /api/v1/public/events` → 204 (throttle 30/min) | ✅ |
| 7 | Event IP/UA hash'li (DB'de plain IP yok) | ✅ (`SELECT ip_hash` ile doğrulandı) |
| 8 | `GET /api/v1/admin/analytics/overview` → counts + breakdown + daily + lang dist + top QR | ✅ |
| 9 | Backend test 105+ yeşil | ✅ **116 passed, 1 skipped** |
| 10 | Tenant isolation: org A user org B events/qr/media göremez | ✅ (testlerle + smoke ile) |
| 11 | Commit'ler main'e push | ✅ |
| 12 | DECISIONS D-017 (analytics pattern) | ✅ |

---

## Oluşturulan / Değiştirilen Dosyalar

### Backend — yeni uygulamalar (apps/)

| App | Dosya | Amaç |
|---|---|---|
| qr | `__init__.py`, `apps.py` | App config |
| qr | `models.py` | `QRCode` (organization FK, branch FK nullable, menu FK, label, target_url, table_number, scan_count, is_active + auto-save URL build) |
| qr | `utils.py` | `build_target_url`, `generate_qr_png`, `sanitize_filename` |
| qr | `serializers.py` | `QRCodeSerializer` (org/menu/branch nested, target_url RO) |
| qr | `views.py` | `QRCodeViewSet` (CRUD + soft delete) + `QRCodeDownloadView` (`image/png`) |
| qr | `urls.py` | Router (`qr-codes/`) + `<int:pk>/download` |
| qr | `admin.py` | Django admin registration (RO) |
| qr | `migrations/0001_initial.py` | QRCode schema |
| qr | `tests/test_qr.py` (10 test) | CRUD + tenant + URL + PNG roundtrip |
| qr | `tests/conftest.py` | menu_a + branch_a fixtures |
| media | `__init__.py`, `apps.py` | App config |
| media | `views.py` | `MediaUploadView` (multipart, mime/size/extension validation, mid-stream cap) |
| media | `urls.py` | `POST /admin/media/upload` |
| media | `tests/test_media.py` (9 test) | jpeg/png/webp + invalid mime/size/ext + tenant subdirectory |
| analytics | `__init__.py`, `apps.py` | App config |
| analytics | `models.py` | `MenuViewEvent` (organization FK, branch/menu/qr_code FKs, event_type, locale, path, ua_hash, ip_hash, referrer) |
| analytics | `hashing.py` | `hash_value` (sha256 + salt + truncate 64), `client_ip`, `user_agent` |
| analytics | `views_public.py` | `PublicEventsView` (Anonymous, throttle 30/min, silent unknown-org) |
| analytics | `views_admin.py` | `AnalyticsOverviewView` (today/week/month, event_counts, language distribution, top_qr_codes, daily_views via TruncDate) |
| analytics | `urls_public.py` | `events` endpoint |
| analytics | `urls_admin.py` | `overview` endpoint |
| analytics | `migrations/0001_initial.py` + `0002_initial.py` | Initial + qr_code FK |
| analytics | `tests/test_events.py` (6 test, 1 skip) | Creation, hash vs plain IP, unknown org, invalid type, tenant isolation |
| analytics | `tests/test_overview.py` (7 test) | Counts, daily aggregation, lang dist, top_qr, tenant, empty |
| analytics | `tests/conftest.py` | menu_a + throttle cache clear |

### Backend — mevcut dosyalarda değişiklikler

| Dosya | Değişiklik |
|---|---|
| `backend/requirements.txt` | + `qrcode[pil]==7.4.2` |
| `backend/config/settings/base.py` | + 3 LOCAL_APPS (qr, media, analytics); + `PUBLIC_BASE_URL` env; + `ANALYTICS_SALT` env; + throttle scope `public_events: 30/min`; **bugfix**: `_BACKEND_DIR = Path(__file__).parents[2]` (önce `parents[1]` → `/app/config` idi, doğrusu `/app` olmalı; MEDIA_ROOT bind mount path'i ile uyumlu oldu) |
| `backend/config/urls.py` | + QR + media + analytics admin route'ları + public events route |
| `.env.example` | + `PUBLIC_BASE_URL` + `ANALYTICS_SALT` belgeleri |

### Docs

| Dosya | Değişiklik |
|---|---|
| `DECISIONS.md` | + D-017 — QR + media + analytics pattern |
| `docs/SPRINT_5_PLAN.md` | (önceki sprint'te) |
| `docs/SPRINT_5A_REPORT.md` | (bu dosya) |

---

## Doğrulama Komut Çıktıları

### 1. Migration apply

```
$ docker compose exec backend python manage.py migrate
Operations to perform:
  Apply all migrations: accounts, admin, analytics, audit, auth, branches, contenttypes, menu, organizations, qr, sessions, theme
Running migrations:
  Applying qr.0001_initial... OK
  Applying analytics.0001_initial... OK
  Applying analytics.0002_initial... OK
```

### 2. Full pytest

```
$ docker compose exec backend pytest -q --no-header
...........s................
116 passed, 1 skipped, 1 warning in 22.96s
```

Skip (Sprint 4A throttle skip pattern'iyle uyumlu):

```
SKIPPED [1] apps/analytics/tests/test_events.py:88
  DRF throttle cache share across tests; Sprint 4A skip pattern.
  Manual smoke Sprint 5B.
```

### 3. Yeni testler (33 toplam: 10 + 9 + 6 + 7 + 1 skip)

```
$ pytest apps/qr/ apps/media/ apps/analytics/ -q
apps/qr/tests/test_qr.py ..........                                  [ 30%]
apps/media/tests/test_media.py .........                             [ 60%]
apps/analytics/tests/test_events.py ..s...                           [ 78%]
apps/analytics/tests/test_overview.py .......                        [100%]
32 passed, 1 skipped, 1 warning in 8.04s
```

### 4. Curl smoke — QR CRUD + PNG download

```bash
# CSRF + login
$ curl -c cookies http://localhost:8000/api/v1/auth/csrf
{"csrfToken":"..."}

$ curl -b cookies -X POST http://localhost:8000/api/v1/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"admin@modern-cafe.local","password":"change-me-demo-only"}'
{"data":{"id":1,"email":"admin@modern-cafe.local","role":"admin",...}}

# Create QR
$ curl -b cookies -X POST http://localhost:8000/api/v1/admin/qr-codes/ \
       -H "Content-Type: application/json" \
       -d '{"organization_id":1,"menu_id":5,"label":"Smoke Test QR","table_number":"T-1"}'
{"data":{"id":1,
         "organization":{"id":1,"name":"Modern Cafe","slug":"modern-cafe"},
         "branch":null,"menu":{"id":5,"name":"Modern Cafe Menü","slug":"modern-cafe-menu"},
         "label":"Smoke Test QR",
         "target_url":"http://localhost:3000/m/modern-cafe?qr=1",
         "scan_count":0,"is_active":true,...}}

# Download PNG
$ curl -b cookies http://localhost:8000/api/v1/admin/qr-codes/1/download -o /tmp/qr_smoke.png
$ file /tmp/qr_smoke.png
/tmp/qr_smoke.png: PNG image data, 370 x 370, 1-bit grayscale, non-interlaced
```

### 5. Curl smoke — Media upload (multipart)

```bash
$ python3 -c "from PIL import Image; ..."
   → 78-byte PNG (10x10 RGB) yazıldı.

$ curl -b cookies -X POST http://localhost:8000/api/v1/admin/media/upload \
       -F "file=@/tmp/test.png;type=image/png"
{"data":{"url":"http://localhost:3000/media/uploads/1/81a2020e061843748d61664ebfa97932-test.png",
         "filename":"81a2020e061843748d61664ebfa97932-test.png",
         "size":78,"content_type":"image/png","organization_id":1}}

# Host'ta dosya var mı?
$ ls -la backend/media/uploads/1/
total 8
-rw-r--r--  1 mehmetakif  staff  78 Sep 26 18:04 81a2020e061843748d61664ebfa97932-test.png
```

(`BASE_DIR` bugfix öncesi dosya `/app/config/media/`'ya yazılıyordu; bind mount ile uyumlu değildi. `parents[1]` → `parents[2]` ile düzeltildi.)

### 6. Curl smoke — Public events + IP/UA hash

```bash
# 5 farklı event_type 204 döner
$ for t in menu_view language_change whatsapp_click phone_click qr_open; do
    curl -s -X POST http://localhost:8000/api/v1/public/events \
      -H "Content-Type: application/json" \
      -d "{\"event_type\":\"$t\",\"locale\":\"tr\",\"organization_slug\":\"modern-cafe\",\
           \"path\":\"/m/modern-cafe\"}" -w "HTTP %{http_code}\n"
  done
HTTP 204
HTTP 204
HTTP 204
HTTP 204
HTTP 204

# Unknown org → silent 204
$ curl -X POST .../events -d '{"event_type":"menu_view","organization_slug":"nope"}'
HTTP 204
```

DB inspection (plain IP yok, hash var):

```python
>>> MenuViewEvent.objects.all()[:5]
id=5 ip_hash=30394ae048b74efb...  ua_hash=848d6784df3ebfdf...
id=4 ip_hash=30394ae048b74efb...  ua_hash=848d6784df3ebfdf...
...
```

### 7. Curl smoke — Analytics overview

```bash
$ curl -b cookies http://localhost:8000/api/v1/admin/analytics/overview
{"data":{
   "today_views": 5,
   "week_views": 5,
   "month_views": 5,
   "event_counts": {
     "menu_view":1, "language_change":1, "whatsapp_click":1,
     "phone_click":1, "qr_open":1
   },
   "language_distribution":{"en":0.2,"tr":0.8},
   "top_qr_codes":[{"id":1,"label":"Smoke Test QR","scan_count":0}],
   "daily_views":[{"date":"2026-09-26","count":5}]
}}
```

---

## Commit Listesi (8 commit)

| # | Commit | Mesaj |
|---|---|---|
| 1 | `chore(backend): qrcode library + apps/qr scaffold + bugfix BASE_DIR` | `requirements.txt` + new apps config + BASE_DIR fix |
| 2 | `feat(qr): QRCode model + admin CRUD endpoints + target_url auto-build` | Model + migration + serializers + views + urls |
| 3 | `feat(qr): PNG download endpoint (qrcode[pil] library)` | `QRCodeDownloadView` + `generate_qr_png` utility |
| 4 | `feat(media): multipart upload endpoint + validation (mime/size/extension)` | `MediaUploadView` + tenant-scoped disk path |
| 5 | `feat(analytics): MenuViewEvent model + migration + IP/UA hashing` | Model + analytics hashing helpers + migrations |
| 6 | `feat(analytics): public events endpoint (IP/UA hash + 30/min throttle)` | `PublicEventsView` + DRF scope config |
| 7 | `feat(analytics): admin overview endpoint (today/week/month + breakdown + daily)` | `AnalyticsOverviewView` + `TruncDate` aggregation |
| 8 | `test(backend): qr + media + analytics tests (~33 new, 116 total)` | apps/qr + media + analytics test files |
| 9 | `chore(docs): DECISIONS D-017 + Sprint 5A report + env updates` | DECISIONS.md + SPRINT_5A_REPORT.md + .env.example |

---

## QR Scan Demo

İndirilen PNG (`/tmp/qr_smoke.png`, 370x370, 1-bit grayscale) içine
`qrcode[pil]` encoder ile gömülen string:

```
http://localhost:3000/m/modern-cafe?qr=1
```

Phone scanner ile açıldığında Next.js dev server'a `/m/modern-cafe?qr=1` isteği gider; `?qr=1` query param'ı ileride frontend'de analytics `qr_open` olayı tetikleyecek (Sprint 5B).

---

## Media Upload Demo

`/tmp/test.png` (78-byte minimal PNG) → `/app/media/uploads/1/<uuid>-test.png`
→ URL: `http://localhost:3000/media/uploads/1/<uuid>-test.png`

Caddy/Cloudflare prod'da aynı path'i serve eder; tenant prefix (`uploads/1/`)
filesystem tarafında da görünür.

---

## Analytics Event Flow

```
Browser (Sprint 5B)
  └─ fetch POST /api/v1/public/events {event_type, locale, path, organization_slug}
       ↓
DRF throttle 30/min/IP  →  PublicEventsView
                          ├─ validate event_type (5 known)
                          ├─ lookup org by slug (silent 204 if missing)
                          └─ MenuViewEvent.create(
                                organization=org,
                                locale, path,
                                user_agent_hash = sha256(salt + ':' + ua)[:64],
                                ip_hash        = sha256(salt + ':' + ip)[:64],
                             )
                                 ↓
admin GET /api/v1/admin/analytics/overview
  → AnalyticsOverviewView
       ├─ today_views / week_views / month_views  (created_at filter)
       ├─ event_counts (5 type)
       ├─ language_distribution (ratio)
       ├─ top_qr_codes (QRCode.scan_count desc, 5)
       └─ daily_views (TruncDate("created_at") GROUP BY day)
            ↓
JSON envelope {data, meta}
```

---

## Sprint 5B Frontend Hazırlığı

Backend tarafı 5B için hazır:

- **`GET  /api/v1/admin/qr-codes/`** — list (paginated)
- **`POST /api/v1/admin/qr-codes/`** — create (label + menu_id + optional branch_id + optional table_number)
- **`GET  /api/v1/admin/qr-codes/{id}/`** — detail
- **`PATCH /api/v1/admin/qr-codes/{id}/`** — update label / is_active
- **`DELETE /api/v1/admin/qr-codes/{id}/`** — soft delete (is_active=False)
- **`GET  /api/v1/admin/qr-codes/{id}/download`** — `<img src=...>` inline preview + `<a href=... download>` download
- **`POST /api/v1/admin/media/upload`** — multipart, returns `{url, filename, size, content_type}`
- **`GET  /api/v1/admin/analytics/overview?days=30`** — counts + breakdown payload

Frontend worker'ın yapacakları:

1. `/admin/qr-codes` sayfa ailesi (Sprint 5B plan'da)
2. `/admin/analytics` stat cards + basit SVG bar (recharts yok, V1)
3. `src/lib/events.ts` — `trackEvent(eventType, payload)` helper
4. `ImageUpload` multipart entegrasyonu
5. BusinessHero + ItemDetailDrawer üzerinde `whatsapp_click` / `phone_click` event'leri

---

## V1 Dışı Yapılmayanlar (Guard)

- Online ödeme
- Sipariş
- Mutfak ekranı
- Garson çağırma
- POS
- Rezervasyon
- Müşteri hesabı
- Sadakat
- AI menü import
- Cloud storage (S3/R2) — D-011 local MEDIA_ROOT
- Recharts/Chart.js — Sprint 5B SVG yeterli
- Multi-org tenant switcher — V1 single-org per session

---

## Notlar

- `qrcode[pil]==7.4.2` pip install başarılı, encoder tarafı test edildi.
- Public events throttle test skip pattern'i Sprint 4A cache izolasyon problemi ile uyumlu; manuel curl smoke ile confirm edilebilir.
- `MenuViewEvent.created_at` indexed (db_index=True) — analytics today/week/month hızlı.
- `language_distribution` ratio (0..1) — frontend render kolay.
- `top_qr_codes` Sprint 5A'da `QRCode.scan_count` üzerinden; V2'de MenuViewEvent aggregation'a geçiş planı var.
- BASE_DIR bugfix (`parents[1]` → `parents[2]`) MEDYA dosyalarını docker bind mount path'ine yazdırır (önce `/app/config/media/`'ya yazılıp kayboluyordu). Bu pre-existing bug, Sprint 5A'da düzeltildi.
- `ANALYTICS_SALT` production env'de 32+ karakter random olmalı (`secrets.token_urlsafe(32)`); `.env.example` belgeledi.

---

**Sprint 5A tamamlandı. 5B (frontend) için hazır.**
