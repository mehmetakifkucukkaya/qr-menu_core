# API Contract — QR Menü V1

**Tarih:** 2026-09-26
**Versiyon:** V1 (Sprint 6C)
**Base URL:** `http://localhost:8000` (local) · `https://api.example.com` (prod)
**Spec:** REST + JSON, DRF `SessionAuthentication` (cookie) + CSRF + JSON `envelope`

Bu belge QR Menü backend'inin tüm HTTP endpoint'lerini, request/response shape'lerini, auth modelini, hata formatını ve sayfalama/filtreleme kurallarını tek noktada toplar. Frontend ekibi, harici entegrasyon yapan bir geliştirici veya CI gate'i yazan biri buradan başlayabilir.

> **Kaynak:** Bu doküman `backend/config/urls.py` ve her app'in `urls*.py` modüllerinden türetilmiştir. Yeni endpoint eklenirken burası da güncellenmelidir (Sprint 6C review gate).

---

## 1. Genel Konvansiyonlar

### 1.1 Response Envelope

Tüm JSON response'lar (health ve 204 No Content hariç) tek tip envelope ile döner:

```json
{
  "data": <payload>,
  "meta": {
    "request_id": "<uuid-via-X-Request-Id header>"
  }
}
```

- **`data`** — Endpoint'e göre object, array veya paginated list.
- **`meta.request_id`** — `X-Request-Id` middleware'inden geçen değer (yoksa boş string). Log korelasyonu için kullanılır.

**İstisnalar:**
- `GET /health` → envelope YOK (uptime check JSON parse kolay olsun diye düz obje).
- `POST /api/v1/public/events` → 204 No Content (envelope YOK).
- `GET /api/v1/admin/qr-codes/{id}/download` → `image/png` binary, envelope YOK.
- Hata response'ları `data` yerine `error` kullanır (bkz. §1.3).

### 1.2 Pagination

DRF `PageNumberPagination` varsayılan. Sayfalı response'lar (örn. QR list) şu shape'i taşır:

```json
{
  "data": {
    "count": 42,
    "next": "http://localhost:8000/api/v1/admin/qr-codes/?page=3",
    "previous": "http://localhost:8000/api/v1/admin/qr-codes/?page=1",
    "results": [ ... ]
  },
  "meta": { "request_id": "..." }
}
```

Sayfa başına kayıt sayısı varsayılan 25. `?page=N` query param ile gezilir; sayfa dışına çıkılırsa 404 döner.

### 1.3 Hata Formatı

Tüm hatalar (4xx, 5xx) tek formatta döner:

```json
{
  "error": {
    "code": "menu.not_found",
    "message": "Aktif menü bulunamadı."
  },
  "meta": {
    "request_id": "..."
  }
}
```

- **`code`** — Stable, machine-readable identifier (Türkçe UI için çevrilebilir). V1 kodları için §6 Error Codes.
- **`message`** — Türkçe, insan-okur, ürün default locale (tr).
- DRF validation errors (`{"field": ["..."]}`) bazı admin endpoint'lerinde envelope DİŞI döner (DRF default). Bu bilinen bir tutarsızlık; Sprint 6C bunu değiştirmez (bilinçli scope-out, V2 wrap-on-error PR'ında düzeltilecek).

### 1.4 HTTP Status Kodları

| Durum | Kullanım |
|------|----------|
| `200 OK` | Successful read/update. |
| `201 Created` | POST başarılı (DRF default — V1'de envelope wrap edilir). |
| `204 No Content` | DELETE başarılı (soft delete), public events, logout. |
| `400 Bad Request` | Validation error, geçersiz payload. |
| `401 Unauthorized` | Auth yok/expired, login başarısız. |
| `403 Forbidden` | CSRF fail, tenant-isolation engelledi (`IsOrganizationMember`). |
| `404 Not Found` | Resource yok, soft-delete edilmiş. |
| `429 Too Many Requests` | `AnonRateThrottle` veya `PublicEventsThrottle` aşıldı. |
| `500 Internal Server Error` | Beklenmeyen hata — Sentry'ye gider. |

### 1.5 Auth Modeli

**Session + CSRF** (Django/DRF standard), JWT yok.

- **Cookie:** `sessionid` (HttpOnly, SameSite=Lax, Secure in prod). Login sonrası set edilir, logout'ta silinir.
- **CSRF cookie:** `csrftoken`. POST/PATCH/DELETE'de client `X-CSRFToken` header'ına bu değeri echo etmeli.
- **Login flow:**
  1. `GET /api/v1/auth/csrf` → `csrfToken` JSON + `csrftoken` cookie
  2. `POST /api/v1/auth/login` body `{"email","password"}` + header `X-CSRFToken: <cookie value>`
  3. Response 200 + `Set-Cookie: sessionid=...`
  4. Sonraki admin POST/PATCH/DELETE'de aynı cookie'leri gönder
- **Tenant isolation:** `IsOrganizationMember` permission — user'ın en az bir aktif `Membership`'i olmalı. Birden fazla org varsa V1'de "ilk aktif membership" seçilir (multi-tenant switcher V2).

### 1.6 Throttling

DRF `AnonRateThrottle` global default **60 req/min per IP** (`config/settings/base.py`).
`PublicEventsThrottle` (override) **30 req/min per IP** (`/api/v1/public/events`).

Auth'lı kullanıcı throttle edilmez (V1 — V2'de `UserRateThrottle` eklenebilir).

### 1.7 Content-Type

- Request: `application/json` (varsayılan) veya `multipart/form-data` (`/admin/media/upload`).
- Response: `application/json; charset=utf-8`. İstisna: `/admin/qr-codes/{id}/download` → `image/png`.

### 1.8 CORS

Production'da `CORS_ALLOWED_ORIGINS` env'den okunur (comma-separated). V1'de frontend origin
(örn. `https://menu.example.com`) + admin panel origin (örn. `https://admin.example.com`)
allowlist'te olmalı.

---

## 2. Health & Public Endpoints

### `GET /health`

**Auth:** Yok (AllowAny). **Throttle:** Yok. **Envelope:** YOK.

Docker healthcheck, uptime monitor ve load balancer probe için.

**Response 200:**

```json
{
  "status": "ok",
  "database": "ok",
  "version": "1.0.0",
  "timestamp": "2026-09-26T13:00:00+00:00"
}
```

DB erişilemezse `"status": "degraded"` + `"database": "error"`. HTTP kodu yine 200 (body
konuşur) — bu bilinçli bir karar (D-018): Docker healthcheck `interval` + `retries`
yönetir, 503 dönmek LB'yi yanıltır.

**curl:**

```bash
curl -fsS http://localhost:8000/health
```

---

### `GET /api/v1/public/menus/{business_slug}`

**Auth:** Yok. **Throttle:** AnonRateThrottle (60/min/IP). **Envelope:** Var.

Sprint 3 — Next.js frontend'in tükettiği primary public endpoint. Tam menü payload'unu
(`business`, `menu`, `theme`, `categories`, `allergens`, `dietary_tags`, `cta`) döner.

**Path params:**
- `business_slug` (str) — Organization.slug, örn. `modern-cafe`.

**Query params:**
- `branch` (str, opsiyonel) — `Branch.slug`. Org-wide aktif menü yerine şubeye özel menü.
- `locale` (str, default `tr`) — Tercih edilen locale code (`tr` veya `en`). Translation
  fallback sırası: query → menu.default_locale → source model field.

**Response 200:**

```json
{
  "data": {
    "business": {
      "id": 1,
      "slug": "modern-cafe",
      "name": "Modern Cafe",
      "logo_url": "https://...",
      "cover_url": "https://...",
      "phone": "+90 555 ...",
      "whatsapp_phone": "+90 555 ...",
      "instagram_url": "https://instagram.com/...",
      "currency": "TRY",
      "default_locale": "tr",
      "supported_locales": ["tr", "en"]
    },
    "menu": {
      "id": 12,
      "name": "Ana Menü",
      "slug": "main",
      "default_locale": "tr",
      "supported_locales": ["tr", "en"],
      "currency": "TRY"
    },
    "theme": {
      "primary_color": "#7B2CBF",
      "secondary_color": "#FFD60A",
      "accent_color": "#06FFA5",
      "background_color": "#FFFFFF",
      "text_color": "#1A1A1A",
      "font_family": "Inter",
      "layout_variant": "modern"
    },
    "categories": [
      {
        "id": 34,
        "slug": "kahve",
        "sort_order": 1,
        "name": "Kahve",
        "description": "...",
        "locale_used": "tr",
        "image": "https://...",
        "items": [
          {
            "id": 101,
            "sort_order": 1,
            "name": "Latte",
            "description": "Espresso + buharda ısıtılmış süt",
            "locale_used": "tr",
            "price": "95.00",
            "compare_at_price": "105.00",
            "currency": "TRY",
            "image": "https://...",
            "is_featured": true,
            "is_popular": false,
            "is_new": false,
            "spice_level": 0,
            "allergens": ["milk"],
            "dietary_tags": ["vegetarian"]
          }
        ]
      }
    ],
    "allergens": [
      { "code": "milk", "name": "Süt", "icon": "🥛" }
    ],
    "dietary_tags": [
      { "code": "vegetarian", "name": "Vejetaryen", "icon": "🥗", "color": "#06FFA5" }
    ],
    "cta": {
      "call_phone": "+90 555 ...",
      "whatsapp": "+90 555 ...",
      "instagram": "https://instagram.com/..."
    }
  },
  "meta": { "request_id": "abc-123" }
}
```

**Response 404:**

```json
{
  "error": {
    "code": "business.not_found" | "branch.not_found" | "menu.not_found",
    "message": "İşletme bulunamadı veya pasif."
  },
  "meta": { "request_id": "..." }
}
```

**curl:**

```bash
curl -fsS "http://localhost:8000/api/v1/public/menus/modern-cafe?locale=tr"
curl -fsS "http://localhost:8000/api/v1/public/menus/modern-cafe?branch=kadikoy&locale=en"
```

---

### `POST /api/v1/public/events`

**Auth:** Yok. **Throttle:** PublicEventsThrottle (30/min/IP). **Envelope:** YOK.

Sprint 5A — Public visitor'ların UI event'lerini (menu_view, language_change,
whatsapp_click, phone_click, qr_open) kaydeder. Tenant identification payload'daki
`organization_slug` üzerinden yapılır. Hatalı/unknown org slug için 204 döner
(business enumeration saldırısına karşı).

**Body:**

```json
{
  "event_type": "menu_view",
  "locale": "tr",
  "path": "/m/modern-cafe",
  "organization_slug": "modern-cafe",
  "menu_id": 12,
  "branch_id": 3,
  "qr_id": 17
}
```

| Field | Tip | Zorunlu | Not |
|-------|-----|---------|-----|
| `event_type` | string | evet | `menu_view`, `language_change`, `whatsapp_click`, `phone_click`, `qr_open` |
| `locale` | string (≤5) | hayır | Default `tr` |
| `path` | string (≤500) | hayır | Truncate edilir |
| `organization_slug` | string | hayır | Yoksa veya invalid ise silent 204 |
| `menu_id`, `branch_id`, `qr_id` | int | hayır | Analytics enrichment |

**Response 204:** No Content (success).

**Response 400:**

```json
{
  "error": {
    "code": "events.invalid_type",
    "message": "event_type şunlardan biri olmalı: ['language_change', 'menu_view', 'phone_click', 'qr_open', 'whatsapp_click']."
  }
}
```

**curl:**

```bash
curl -fsS -X POST http://localhost:8000/api/v1/public/events \
  -H "Content-Type: application/json" \
  -d '{"event_type":"menu_view","locale":"tr","path":"/m/modern-cafe","organization_slug":"modern-cafe"}'
```

---

## 3. Auth Endpoints

### `GET /api/v1/auth/csrf`

**Auth:** Yok. **Throttle:** Yok. **Envelope:** Var.

Login dahil tüm POST'lardan önce client bu endpoint'i çağırarak CSRF cookie + token alır.

**Response 200:**

```json
{ "csrfToken": "abc123def456..." }
```

**curl:**

```bash
curl -fsS -c /tmp/cookies.txt http://localhost:8000/api/v1/auth/csrf
# Sonraki POST'larda: -b /tmp/cookies.txt -H "X-CSRFToken: $(grep csrftoken /tmp/cookies.txt | awk '{print $7}')"
```

---

### `POST /api/v1/auth/login`

**Auth:** Yok. **Throttle:** Yok. **CSRF:** Zorunlu. **Envelope:** Var.

Email + password ile session açılır. `User.is_active=True` olanlar girebilir.

**Body:**

```json
{ "email": "owner@modern-cafe.com", "password": "..." }
```

**Response 200:**

```json
{
  "data": {
    "id": 1,
    "email": "owner@modern-cafe.com",
    "first_name": "Ayşe",
    "last_name": "Yılmaz",
    "is_staff": false,
    "is_platform_admin": false
  },
  "meta": { "request_id": "..." }
}
```

Response `Set-Cookie: sessionid=...; csrftoken=...` içerir.

**Response 401:**

```json
{ "error": { "code": "auth.invalid_credentials", "message": "Email veya şifre hatalı." } }
```

**curl:**

```bash
curl -fsS -c /tmp/cookies.txt -b /tmp/cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <token>" \
  -X POST http://localhost:8000/api/v1/auth/login \
  -d '{"email":"owner@modern-cafe.com","password":"correcthorse"}'
```

---

### `POST /api/v1/auth/logout`

**Auth:** Session zorunlu. **CSRF:** Zorunlu. **Envelope:** YOK (204).

**Response 204:** No Content. `Set-Cookie: sessionid=; expires=Thu, 01 Jan 1970...`

**curl:**

```bash
curl -fsS -b /tmp/cookies.txt -H "X-CSRFToken: <token>" \
  -X POST http://localhost:8000/api/v1/auth/logout
```

---

### `GET /api/v1/me`

**Auth:** Session zorunlu. **CSRF:** Gerek yok (GET). **Envelope:** Var.

Login olan kullanıcının bilgilerini döner. Frontend, login sonrası bunu çağırarak
"current user" state'i kurar.

**Response 200:** `LoginView` ile aynı `UserSerializer` shape'i.

**curl:**

```bash
curl -fsS -b /tmp/cookies.txt http://localhost:8000/api/v1/me
```

---

## 4. Admin Endpoints (IsOrganizationMember)

Aşağıdaki TÜM endpoint'ler:

- **Auth:** Session zorunlu (`IsAuthenticated` + `IsOrganizationMember`)
- **CSRF:** POST/PATCH/DELETE'de zorunlu
- **Tenant isolation:** İlk aktif membership'in organization'ı scope. Multi-org V2'de.
- **Envelope:** Tümünde `{data, meta}` var (DRF source order'a göre).

### 4.1 Organizations

`/api/v1/admin/organizations/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Liste (sayfalı). Platform admin tüm org'ları, user sadece kendi membership'lerini görür. |
| GET | `/{id}/` | Detay. |
| PATCH | `/{id}/` | Partial update. |
| POST | `/` | Yeni org oluştur (platform admin only). |

V1'de CRUD sınırlı: tenant boundary'yi değiştiren işlemler `is_platform_admin=True` ister.

### 4.2 Branches

`/api/v1/admin/branches/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Tenant'ın aktif şubeleri. |
| POST | `/` | Yeni branch. Body: `{organization, name, slug, address, phone, is_active}`. |
| GET | `/{id}/` | Detay. |
| PATCH | `/{id}/` | Update. |
| DELETE | `/{id}/` | Soft delete (`is_active=False`). |

### 4.3 Theme Config

`/api/v1/admin/theme/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Tenant'ın theme config'i (tekil). |
| PATCH | `/` | Renkler, font, layout_variant update. |
| POST | `/` | Yoksa oluştur (1:1 Organization ↔ ThemeConfig). |

Body fields: `primary_color`, `secondary_color`, `accent_color`, `background_color`,
`text_color` (hex), `font_family`, `layout_variant` (`modern` | `classic`).

### 4.4 Menus

`/api/v1/admin/menus/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Tenant menüleri. |
| POST | `/` | Yeni menü. Body: `{organization, name, slug, default_locale, supported_locales, currency, branch?}` |
| GET | `/{id}/` | Detay (categories + items dahil). |
| PATCH | `/{id}/` | Update. |
| DELETE | `/{id}/` | Soft delete. |

### 4.5 Categories

`/api/v1/admin/categories/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Tenant'ın tüm kategorileri (menu filter ile). |
| POST | `/` | Yeni kategori. Body: `{menu, slug, sort_order, image?}` + translation rows. |
| GET | `/{id}/` | Detay. |
| PATCH | `/{id}/` | Update. |
| DELETE | `/{id}/` | Soft delete. |
| POST | `/reorder` | `{menu_id, ordered_ids: [..]}` — drag-drop reorder için bulk endpoint. |

### 4.6 Menu Items

`/api/v1/admin/menu-items/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/` | Tenant'ın tüm item'ları (category filter ile). |
| POST | `/` | Yeni item. Body: `{category, slug, price, currency, image?, allergens?, dietary_tags?, flags}` + translation rows. |
| GET | `/{id}/` | Detay. |
| PATCH | `/{id}/` | Update. |
| DELETE | `/{id}/` | Soft delete. |
| POST | `/reorder` | `{category_id, ordered_ids: [..]}` — drag-drop reorder. |

### 4.7 Reference Data

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/v1/admin/allergens/` | Tüm aktif allergenler. Read-only V1. |
| GET | `/api/v1/admin/dietary-tags/` | Tüm aktif dietary tagler. Read-only V1. |

Response shape (her ikisi için):

```json
{
  "data": [
    { "id": 1, "code": "milk", "name": "Süt", "icon": "🥛", "is_active": true }
  ],
  "meta": { "request_id": "..." }
}
```

---

### 4.8 Audit / Admin Summary

`/api/v1/admin/summary`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/v1/admin/summary` | Dashboard payload: counts + recent events. |

**Response 200:**

```json
{
  "data": {
    "menu_count": 2,
    "category_count": 5,
    "item_count": 24,
    "active_item_count": 24,
    "branch_count": 1,
    "recent_events": [
      {
        "id": 88,
        "actor": "owner@modern-cafe.com",
        "action": "update",
        "target_type": "menu_item",
        "target_id": 101,
        "target_repr": "Latte",
        "payload": { "price": "105.00", "old_price": "95.00" },
        "created_at": "2026-09-26T12:30:00+00:00"
      }
    ],
    "organization": { "id": 1, "slug": "modern-cafe", "name": "Modern Cafe" }
  },
  "meta": { "request_id": "..." }
}
```

---

### 4.9 QR Codes

`/api/v1/admin/qr-codes/`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/v1/admin/qr-codes/` | Sayfalı liste (tenant). |
| POST | `/api/v1/admin/qr-codes/` | Yeni QR. Body: `{organization, label, branch?, menu?}` |
| GET | `/api/v1/admin/qr-codes/{id}/` | Detay. |
| PATCH | `/api/v1/admin/qr-codes/{id}/` | Update. |
| DELETE | `/api/v1/admin/qr-codes/{id}/` | Soft delete (`is_active=False`). |
| GET | `/api/v1/admin/qr-codes/{id}/download` | PNG stream. **Envelope YOK.** |

**Download Response 200:**

```
HTTP/1.1 200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="qr-modern-cafe-masa-1.png"

<binary PNG>
```

V1'de PNG on-the-fly `qrcode[pil]` ile oluşturulur (D-005); cache'leme V2'de.

**curl:**

```bash
# Liste
curl -fsS -b /tmp/cookies.txt http://localhost:8000/api/v1/admin/qr-codes/

# Download (PNG binary → file)
curl -fsS -b /tmp/cookies.txt \
  http://localhost:8000/api/v1/admin/qr-codes/17/download \
  -o qr-masa-1.png
```

---

### 4.10 Media Upload

`/api/v1/admin/media/upload`

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/v1/admin/media/upload` | multipart/form-data, `file=<binary>` |

**Validation:**
- MIME whitelist: `image/jpeg`, `image/png`, `image/webp`
- Extension whitelist: `.jpg`, `.jpeg`, `.png`, `.webp`
- Size cap: 5 MB

**Response 201:**

```json
{
  "data": {
    "url": "https://api.example.com/media/uploads/1/abc-modern-cafe-logo.png",
    "filename": "modern-cafe-logo.png",
    "size": 245678,
    "content_type": "image/png"
  },
  "meta": { "request_id": "..." }
}
```

Storage: `MEDIA_ROOT/uploads/{organization_id}/{uuid4}-{sanitized_filename}`.
DB model yok (D-011) — URL'in kendisi reference.

**curl:**

```bash
curl -fsS -b /tmp/cookies.txt -H "X-CSRFToken: <token>" \
  -F "file=@/tmp/logo.png" \
  http://localhost:8000/api/v1/admin/media/upload
```

---

### 4.11 Analytics Overview

`/api/v1/admin/analytics/overview`

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/v1/admin/analytics/overview?days=30` | Dashboard analytics payload. |

**Query params:**
- `days` (int, 1..90, default 30) — Pencere genişliği. Daily views + language_distribution bu pencereye göre hesaplanır.

**Response 200:**

```json
{
  "data": {
    "today_views": 47,
    "week_views": 312,
    "month_views": 1488,
    "event_counts": {
      "menu_view": 1200,
      "language_change": 89,
      "whatsapp_click": 142,
      "phone_click": 38,
      "qr_open": 19
    },
    "language_distribution": { "tr": 0.74, "en": 0.26 },
    "top_qr_codes": [
      { "id": 17, "label": "Masa 1", "scan_count": 142 }
    ],
    "daily_views": [
      { "date": "2026-09-01", "count": 48 },
      { "date": "2026-09-02", "count": 52 }
    ]
  },
  "meta": { "request_id": "..." }
}
```

**curl:**

```bash
curl -fsS -b /tmp/cookies.txt \
  "http://localhost:8000/api/v1/admin/analytics/overview?days=30"
```

---

## 5. Frontend Convenience Routes (Next.js)

Next.js tarafında backend'e giden tek şey API_URL. Pages:

| Path | Açıklama |
|------|----------|
| `/` | Locale root, business switcher landing. |
| `/m/[slug]` | Public menü sayfası (SSR + ISR revalidate=60). |
| `/m/[slug]?branch=<slug>&qr=<id>` | QR ile gelen ziyaretçi — qr_open event loglanır. |
| `/login` | Admin login formu. |
| `/admin/dashboard` | Dashboard home (summary + recent events). |
| `/admin/menus` | Menu listesi. |
| `/admin/menus/[id]` | Menu edit (categories + items). |
| `/admin/branches` | Şube yönetimi. |
| `/admin/theme` | Theme config (renkler, font, layout). |
| `/admin/qr-codes` | QR listesi + create + download. |
| `/admin/media` | Upload UI. |
| `/admin/analytics` | Analytics dashboard (SVG charts). |

---

## 6. Error Codes Reference

V1'de kullanılan tüm error.code'lar (DRF validation error'ları envelope dışı; buraya girmez):

| Code | HTTP | Anlam | Trigger |
|------|------|-------|---------|
| `business.not_found` | 404 | Org yok veya pasif | `GET /public/menus/{slug}` |
| `branch.not_found` | 404 | Branch yok veya pasif | `GET /public/menus/{slug}?branch=...` |
| `menu.not_found` | 404 | Aktif menü yok | `GET /public/menus/{slug}` |
| `events.invalid_type` | 400 | Geçersiz `event_type` | `POST /public/events` |
| `auth.invalid_credentials` | 401 | Email/password yanlış | `POST /auth/login` |

> Public events endpoint'i `organization_slug` invalid olduğunda **204** döner (bilinçli — enumeration koruması). Bu bir hata kodu değil, sessiz drop.

### DRF Validation Errors (Envelope Dışı, V1)

Bazı admin POST/PATCH'lerinde (örn. menu create) DRF default validation hatası
döner:

```json
{
  "name": ["Bu alan zorunludur."],
  "price": ["Geçerli bir sayısal değer girin."]
}
```

V1'de bu shape normalize edilmedi (bilinçli scope-out). Frontend'de bu shape'i handle
eden kodlar Sprint 4A'da `apps/web/src/lib/api.ts` içinde (`extractErrorMessage`)
mevcut.

---

## 7. Endpoint Özet Tablosu

| Method | Path | Auth | Throttle | Not |
|--------|------|------|----------|-----|
| GET | `/health` | yok | yok | Uptime |
| GET | `/api/v1/public/menus/{slug}` | yok | 60/min | Primary public |
| POST | `/api/v1/public/events` | yok | 30/min | Analytics |
| GET | `/api/v1/auth/csrf` | yok | yok | CSRF bootstrap |
| POST | `/api/v1/auth/login` | yok | yok | Session |
| POST | `/api/v1/auth/logout` | session | yok | |
| GET | `/api/v1/me` | session | yok | |
| GET,POST | `/api/v1/admin/organizations/` | IsOrganizationMember | yok | |
| GET,POST | `/api/v1/admin/branches/` | IsOrganizationMember | yok | Soft delete |
| GET,PATCH,POST | `/api/v1/admin/theme/` | IsOrganizationMember | yok | |
| GET,POST | `/api/v1/admin/menus/` | IsOrganizationMember | yok | |
| GET,POST | `/api/v1/admin/categories/` | IsOrganizationMember | yok | + `/reorder` |
| GET,POST | `/api/v1/admin/menu-items/` | IsOrganizationMember | yok | + `/reorder` |
| GET | `/api/v1/admin/allergens/` | IsOrganizationMember | yok | |
| GET | `/api/v1/admin/dietary-tags/` | IsOrganizationMember | yok | |
| GET | `/api/v1/admin/summary` | IsOrganizationMember | yok | Dashboard |
| GET,POST | `/api/v1/admin/qr-codes/` | IsOrganizationMember | yok | + download (PNG) |
| POST | `/api/v1/admin/media/upload` | IsOrganizationMember | yok | multipart |
| GET | `/api/v1/admin/analytics/overview` | IsOrganizationMember | yok | Dashboard charts |

**Toplam: 25+ endpoint.**

---

## 8. Changelog

- **V1 (2026-09-26)** — İlk stabil kontrat. Sprint 6C ile tek dokümana bağlandı.
