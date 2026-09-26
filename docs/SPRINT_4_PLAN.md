# Sprint 4 — Admin Panel V1 — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 4 (3-4 gün, planlanan ~100-120 saat)
**Durum:** Planlandı → 4A worker başlatıldı, 4B sonra
**Önceki:** Sprint 1+2+3A+3B-1+3B-2 ✅ (42 commit, 67 test, 3 servis healthy, public demo uçtan uca çalışıyor)

## Amaç

İşletme sahibi ürün/kategori/fiyat/çeviri/tema yönetebilir. Admin UI Next.js `(admin)` route group içinde, Sprint 2'deki backend admin API'lerini kullanır.

## Alınan Kararlar (D-001..D-014 + OP-11)

- **D-003:** Tek Next.js app + route group `(public)` ve `(admin)` — admin ekle
- **D-007:** Container `node:20-bookworm-slim` multi-stage (zaten kurulu, admin de aynı image'da çalışır)
- **OP-5:** Admin auth = DRF SessionAuthentication + cookie tabanlı; login CSRF korumalı (`GET /api/v1/auth/csrf` → POST `/api/v1/auth/login`)
- **Sprint 2 hazırlığı:** 12 admin endpoint + tenant isolation (`IsOrganizationMember`) hazır
- **Sprint 3 hazırlığı:** API client, types, placeholder stratejisi, theme tokens reusable

## Backend API (Sprint 2'den — kullanıma hazır)

### Auth
- `POST /api/v1/auth/login` — body `{email, password}` → 200 + Set-Cookie session + CSRF cookie
- `POST /api/v1/auth/logout` → 204
- `GET /api/v1/me` — current user JSON
- `GET /api/v1/auth/csrf` — CSRF token

### Organization / Branch / Theme
- `GET /api/v1/admin/organizations/current`
- `PATCH /api/v1/admin/organizations/current`
- `GET/POST /api/v1/admin/branches`, `PATCH/DELETE /api/v1/admin/branches/{id}`
- `GET/POST /api/v1/admin/theme` (veya branch bazlı)

### Menu Domain
- `GET/POST /api/v1/admin/menus`, `GET/PATCH/DELETE /api/v1/admin/menus/{id}`
- `GET/POST /api/v1/admin/menus/{id}/categories`
- `PATCH/DELETE /api/v1/admin/categories/{id}`
- `POST /api/v1/admin/categories/reorder` — body `{menu_id, ordered_ids: [3,1,4,2]}`
- `GET/POST /api/v1/admin/menu-items`, `GET/PATCH/DELETE /api/v1/admin/menu-items/{id}`
- `POST /api/v1/admin/menu-items/reorder` — body `{category_id, ordered_ids: [...]}`

### Reference Data
- `GET /api/v1/admin/allergens`
- `GET /api/v1/admin/dietary-tags`

## Frontend — Admin Route Group

### Yapı

```
apps/web/src/app/(admin)/
├── layout.tsx                  (admin shell, auth guard via middleware)
├── login/
│   └── page.tsx                (login form)
├── dashboard/
│   └── page.tsx                (dashboard with key metrics)
├── business/
│   ├── page.tsx                (organization settings)
│   └── theme/page.tsx          (theme settings — colors)
├── menus/
│   ├── page.tsx                (menu list)
│   ├── new/page.tsx            (create menu)
│   └── [menuId]/
│       ├── page.tsx            (menu detail with categories)
│       ├── categories/...
│       └── items/...
└── _components/                (admin-only components)
    ├── AdminSidebar.tsx
    ├── AdminHeader.tsx
    ├── FormField.tsx
    ├── ImageUpload.tsx
    ├── TranslationTabs.tsx
    ├── AllergenSelector.tsx
    ├── DietaryTagSelector.tsx
    └── ConfirmDialog.tsx
```

### Auth Flow

1. `(admin)/layout.tsx` middleware-like check: cookie session var mı?
   - Yoksa → redirect `/login?next=/admin/dashboard`
   - Var mı → `GET /api/v1/me` doğrula (CSRF + cookie ile)
2. Login sayfası: form → `GET /api/v1/auth/csrf` → `POST /api/v1/auth/login` → redirect `/admin/dashboard`
3. Logout: `POST /api/v1/auth/logout` → redirect `/login`
4. CSRF token her POST/PATCH/DELETE'de `X-CSRFToken` header'ında gönderilmeli (DRF standardı)

### Middleware (`apps/web/src/middleware.ts`)

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const session = req.cookies.get('qr_sessionid');
  const isAdminRoute = req.nextUrl.pathname.startsWith('/admin');
  const isLoginPage = req.nextUrl.pathname === '/login';

  if (isAdminRoute && !session && !isLoginPage) {
    return NextResponse.redirect(new URL('/login?next=' + req.nextUrl.pathname, req.url));
  }
  // Public route'lar serbest
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|m/).*)'],
};
```

### Components

- **AdminSidebar.tsx** — Dashboard / Menus / Categories / Items / Business / Theme nav + logout
- **AdminHeader.tsx** — breadcrumb + current user + logout button
- **FormField.tsx** — label + input + error message (reusable)
- **ImageUpload.tsx** — file input + preview + remove (D-011 local storage)
- **TranslationTabs.tsx** — TR/EN tab interface for translatable fields
- **AllergenSelector.tsx** — multi-select chips with icons
- **DietaryTagSelector.tsx** — multi-select chips with colors
- **ConfirmDialog.tsx** — delete confirmation

## Sprint 4 Parçaları

### Sprint 4A — Admin Foundation (worker şu an başladı, ~30-45 dk)

| Task | İçerik |
|---|---|
| Middleware | `apps/web/src/middleware.ts` — auth guard |
| Admin layout | `apps/web/src/app/(admin)/layout.tsx` — sidebar + header |
| AdminSidebar component | navigasyon |
| AdminHeader component | breadcrumb + logout |
| Login page | form + CSRF + auth flow |
| Logout endpoint integration | POST /auth/logout |
| Dashboard page | welcome + "henüz menü yok" empty state + recent items list |
| FormField component | reusable input |
| api.ts extensions | admin API wrapper (login, logout, me, csrf, organizations, theme) |
| types/admin.ts | TypeScript types for admin payloads |

**Kabul kriterleri:**
- `/admin/dashboard` (cookie varsa) → 200 + dashboard
- `/admin/dashboard` (cookie yok) → redirect `/login`
- `/login` → form, submit edince CSRF + login → redirect `/admin/dashboard`
- Logout → `/login`
- Middleware cookie kontrolü çalışıyor
- `npm run build` temiz

### Sprint 4B — Menu/Catalog Management (~45-60 dk, sonraki worker)

| Task | İçerik |
|---|---|
| Business settings page | organization info + logo/cover upload |
| Theme settings page | color picker + layout_variant + preview |
| Menus list page | tüm menüler + create button |
| Menu create/edit page | form |
| Categories management | nested + reorder (drag-drop veya up/down butonları) |
| Items list page | filter by category, search, active/inactive toggle |
| Item create/edit form | tüm alanlar + image upload + allergen/tag + translations |
| Price edit flow | inline edit + decimal validation |
| Active/passive toggle | quick action in list |
| TranslationTabs component | TR/EN tab interface |
| AllergenSelector + DietaryTagSelector components | multi-select chips |
| ImageUpload component | file input + preview + remove |

**Kabul kriterleri:**
- Login → dashboard → menus → create → categories → items → edit price → public'te gör
- Image upload local storage (MEDIA_ROOT)
- Allergen/tag seçimi çalışıyor
- Translation TR/EN tab interface çalışıyor
- Reorder işlemi public'te yansıyor

### Sprint 4C — Polish + Audit (V1 demo için opsiyonel)

- Backend admin summary endpoint (`/api/v1/admin/summary` — bugünkü viewlar, menüler, itemlar, QR scan count)
- Audit log eventleri (price change, item deactivate, vs.)
- Admin empty/error/loading states polish

## Commit Stili (Sprint 4 toplam ~15-18 commit)

- `feat(frontend): admin middleware (auth guard)`
- `feat(frontend): admin layout (sidebar + header)`
- `feat(frontend): AdminSidebar + AdminHeader components`
- `feat(frontend): login page + CSRF + auth flow`
- `feat(frontend): dashboard page + admin welcome`
- `feat(frontend): FormField + TranslationTabs reusable components`
- `feat(frontend): business settings page`
- `feat(frontend): theme settings page`
- `feat(frontend): menus list + create/edit pages`
- `feat(frontend): categories management + reorder`
- `feat(frontend): items list + create/edit form`
- `feat(frontend): AllergenSelector + DietaryTagSelector`
- `feat(frontend): ImageUpload component`
- `feat(frontend): price edit + active/passive toggle flow`
- `feat(backend): admin summary endpoint`
- `feat(backend): audit log for price/status changes`
- `chore(docs): DECISIONS D-015 + Sprint 4 report`

## V1 Dışı (YAPMA)

Online ödeme, sipariş, QR generation backend (Sprint 5), image upload cloud storage (Sprint 5 — local'de MEDIA_ROOT), analytics (Sprint 5), müşteri hesabı, AI menü import, push notification.

## Backend Audit Log (Sprint 4C'de eklenir — V1 demo için şart değil)

- `apps/audit/models.py` — `AuditEvent(actor, organization, action, target_type, target_id, payload_json, created_at)`
- Signals ile price change / item deactivate / menu publish event'leri otomatik log
- Admin dashboard'da son 10 event listesi

## Kabul Kriterleri (Sprint 4 toplam)

✅ Login akışı (CSRF + cookie session)
✅ Middleware auth guard
✅ Admin layout (sidebar + header + content)
✅ Dashboard (welcome + recent items)
✅ Business settings (organization info + logo/cover)
✅ Theme settings (color picker + preview)
✅ Menus CRUD
✅ Categories CRUD + reorder
✅ Items CRUD + allergen/tag + translations
✅ Price inline edit
✅ Active/passive toggle
✅ Image upload (local MEDIA_ROOT)
✅ Audit log (Sprint 4C)
✅ `npm run build` temiz
✅ Backend pytest 67+ yeşil
✅ Commit'ler main'e push

## Çalıştırma Adımları (worker)

1. Working directory'ye git
2. Sprint 3B-2 commit'leri yerinde mi kontrol et
3. SPRINT_4_PLAN.md oku
4. Sprint 4A scope'unu uygula (auth + layout + dashboard + login)
5. Sprint 4B scope'unu uygula (business + theme + menus + categories + items)
6. Local doğrulama:
   - `npm run build`
   - `docker compose up -d`
   - Login flow manual test
   - Item CRUD test (admin → public'te gör)
7. DECISIONS.md güncelle (D-015)
8. docs/SPRINT_4_REPORT.md oluştur
9. Commit + push

## Rapor Formatı

1. Kabul kriteri checklist
2. Oluşturulan dosya listesi
3. Doğrulama komut çıktıları
4. Commit listesi
5. V1 demo akışı admin kısmı çalışıyor mu:
   - Login → dashboard
   - Item price update → public'te güncellenir
   - Item deactivate → public'te gizlenir
6. TODO / Sprint 5 için hazırlık

## Auth Expire Riski

**60 dakika kuralı:** Worker 60 dakika içinde tamamlayamıyorsa, scope'u daraltıp commit'le:
- Minimum 4A tamamla (auth + login + dashboard + layout)
- Sonra 4B'yi sonraki worker'a bırak
- "Olduğu kadar commit'le, push'la, durumu raporla"