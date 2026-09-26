# Sprint 4A Report — Admin Foundation

**Tarih:** 2026-09-26
**Sprint:** 4A (Admin Foundation — büyük Sprint 4'ün ilk yarısı)
**Worker:** branch session `mvs_b9711872cefd426993a709fab14e950b`
**Önceki:** Sprint 1+2+3A+3B-1+3B-2 ✅ (43 → **50 commit**)
**Sonraki:** Sprint 4B (menu / catalog management) — bir sonraki worker

## Amaç

İşletme sahibinin admin paneline giriş yapıp boş bir dashboard görebildiği
minimum canlı altyapı. Menü/ürün yönetimi (4B) bundan sonra.

## Kabul Kriterleri (4A)

| # | Kriter | Sonuç | Kanıt |
|---|---|---|---|
| K1 | `apps/web/src/middleware.ts` — cookie yoksa `/admin/*` → `/login?next=...` | ✅ | adım [3]: `307 location=/login?next=%2Fadmin%2Fdashboard` |
| K2 | Middleware `/m/*`, `/api/*`, `/_next/*`, `/favicon.ico` muaf | ✅ | adım [9]: `/m/modern-cafe` 200; matcher `'/((?!api|_next/static\|_next/image\|favicon.ico\|m/).*)'` |
| K3 | `/login` → form + Modern Cafe branding + demo credentials hint | ✅ | adım [4]: 200; HTML'de "Giriş yap", "Email", "Şifre", "Demo hesabı", "admin@modern-cafe.local" hepsi mevcut |
| K4 | `/login` submit → CSRF prime → POST `/auth/login` → redirect `?next=` | ✅ | loginAction server action → response 200 + Set-Cookie; redirect(nextPath) success path |
| K5 | Aktif session varken `/login` → redirect `/admin/dashboard` | ✅ | adım [5]: `307 location=/admin/dashboard` |
| K6 | `/admin/dashboard` cookie ile → 200 + admin shell + welcome | ✅ | adım [6]: 200; HTML 29 KB; içerikte "Admin paneli", "Modern Cafe Admin", "Çıkış yap", "Henüz menünüz yok" |
| K7 | Logout → `/login` | ✅ | adım [7]: logout 204 + Set-Cookie cleanup; layout auth check fails → redirect /login |
| K8 | `npm run build` temiz | ✅ | 6 route build edildi: `/`, `/login`, `/admin/dashboard`, `/m/[businessSlug]`, `/_not-found`, middleware 26.4 KB |
| K9 | `npm run lint` temiz | ✅ | "✔ No ESLint warnings or errors" |
| K10 | `tsc --noEmit` exit 0 | ✅ | TS strict mode, tüm yeni dosyalar dahil |
| K11 | Backend pytest 67 yeşil | ✅ | `67 passed, 1 warning in 12.07s` |

## Oluşturulan Dosyalar

### Frontend — yeni dosyalar (12)

```
apps/web/src/
├── middleware.ts                                       # cookie auth guard
├── lib/
│   └── api-admin.ts                                    # CSRF + login + me + org fetch
├── types/
│   └── admin.ts                                        # CurrentUser, Organization, Branch, ThemeConfig, Menu, MenuItem, …
└── app/(admin)/
    ├── _actions/
    │   └── auth.ts                                     # loginAction + logoutAction (server actions)
    ├── _components/
    │   ├── FormField.tsx                               # controlled input w/ label + error + hint
    │   ├── EmptyState.tsx                              # admin-styled empty card w/ CTA slot
    │   ├── ErrorState.tsx                              # admin-styled error banner w/ retry
    │   ├── AdminSidebar.tsx                            # brand + nav + logout (server-action form)
    │   └── AdminHeader.tsx                             # breadcrumb + user info + logout button
    ├── login/
    │   ├── page.tsx                                    # /login server component
    │   └── LoginForm.tsx                               # /login client form (useFormState + useFormStatus)
    └── admin/
        ├── layout.tsx                                  # admin shell (sidebar + header)
        └── dashboard/
            └── page.tsx                                # welcome + placeholder stats + quick links
```

## Doğrulama Komut Çıktıları

### `npx tsc --noEmit`
```
tsc: PASS
```

### `npm run lint`
```
> next lint
✔ No ESLint warnings or errors
```

### `npm run build`
```
✓ Compiled successfully
✓ Generating static pages (6/6)

Route (app)                              Size     First Load JS
┌ ○ /                                    141 B          87.3 kB
├ ○ /_not-found                          875 B          88.1 kB
├ ƒ /admin/dashboard                     177 B          94.2 kB
├ ƒ /login                               2.35 kB        96.3 kB
└ ƒ /m/[businessSlug]                    12.7 kB        99.8 kB
+ First Load JS shared by all            87.2 kB
ƒ Middleware                             26.4 kB
```

### `docker compose exec backend pytest -q`
```
67 passed, 1 warning in 12.07s
```

## Commit Listesi

7 commit (conventional commits, mantıksal grup bazında):

```
edbef22 feat(frontend): admin layout (sidebar + header) + dashboard page
dae7b19 feat(frontend): login page + CSRF + auth flow
ee4d340 feat(frontend): admin auth server actions (login/logout)
34759ec feat(frontend): AdminSidebar + AdminHeader components
da704c1 feat(frontend): FormField + admin EmptyState/ErrorState components
2bddece feat(frontend): admin API extensions (login/logout/csrf/me)
17a9648 feat(frontend): admin middleware (auth guard)
```

Push: `git push origin main` → `f4f2b4f..edbef22 main -> main`.

## Login Flow — Manuel Test Sonucu

Senaryo: tarayıcı üzerinden admin giriş akışı (Modern Cafe demo hesabı).

```
[1] GET /api/v1/auth/csrf → {"csrfToken":"LNp9hmap..."} ✅
[2] POST /api/v1/auth/login → Set-Cookie qr_sessionid=q4otm0... ✅
[3] /admin/dashboard (no cookie) → 307 → /login?next=/admin/dashboard ✅
[4] /login (no session) → 200 form ✅
[5] /login (active session) → 307 → /admin/dashboard ✅
[6] /admin/dashboard (cookie) → 200 dashboard render ✅
[7] POST /api/v1/auth/logout (X-CSRFToken) → 204 ✅
[8] /admin/dashboard (stale cookie) → 307 → /login (layout auth check fires) ✅
[9] /m/modern-cafe (public) → 200 (middleware muaf) ✅
```

Dashboard HTML içinde doğrulanan elementler:
- Brand: "QR Menü", business name "Modern Cafe Admin"
- Sidebar nav: Dashboard (active), Menüler (yakında), İşletme (yakında), Tema (yakında)
- Header: kullanıcı email, role chip "admin", "Çıkış" butonu
- Welcome banner: "Admin paneli", açıklayıcı metin
- 3 placeholder stat kart (Menü / Kategori / Ürün)
- "Henüz menünüz yok" empty state (4B preview mesajı ile)
- 2 "yakında" quick link kartı (İşletme bilgileri, Tema ayarları)
- Footer hint: "Detaylı istatistikler ve son aktiviteler Sprint 4C ile eklenecek."

Login form HTML'de doğrulanan elementler:
- "Giriş yap" submit button (Modern Cafe primary renkli)
- Email + Password alanları (required, autocomplete set)
- "← Anasayfaya dön" linki
- "Demo hesabı" helper card (sadece `NEXT_PUBLIC_ADMIN_DEMO_HINT` set'li ortamda)
- "Destek" mailto linki
- Hata banner'ı (state.error varsa role="alert")

## Mimari Notlar

### Route group yapısı
```
app/
├── (public)/                              # zaten var
│   └── m/[businessSlug]/page.tsx
└── (admin)/                               # bu sprint
    ├── login/page.tsx                     # URL: /login (layout YOK)
    ├── _actions/auth.ts
    ├── _components/                       # (admin) özel component'ler
    └── admin/                             # /admin/* — layout burada
        ├── layout.tsx                     # sidebar + header
        └── dashboard/page.tsx
```

`(admin)/login` URL'i `/login` çünkü route group parantezleri URL'e dahil edilmiyor.
Bu yüzden `login` route'u `admin/layout.tsx`'in DIŞINDA kalıyor ve login formu
sidebar/header almıyor. `(admin)/admin/*` URL'i `/admin/*` ve protected layout'u alıyor.

### Auth katmanları (defense-in-depth)

1. **Middleware** (`apps/web/src/middleware.ts`)
   - Edge'de çalışır, `qr_sessionid` cookie varlığını kontrol eder
   - Yoksa `/login?next=...` redirect
   - Veritabanı erişimi yok; sadece hızlı "early exit"
   - `/api`, `/_next`, `/favicon.ico`, `/m/*` muaf

2. **Server Component Layout** (`(admin)/admin/layout.tsx`)
   - Authoritative auth check: `/api/v1/me` çağrısı (cookie forward ile)
   - 401/403 → `/login?next=/admin/dashboard` redirect
   - Stale cookie (örn. session expire olmuş ama cookie hâlâ var) burada yakalanır

3. **Server Component Page** (`(admin)/admin/dashboard/page.tsx`)
   - Defence-in-depth: cookie yoksa yine `/login`'e redirect
   - `redirect()` çağrıları try/catch DIŞINDA (Next.js gotcha — `redirect()`
     `NEXT_REDIRECT` exception fırlatır, naive `catch {}` onu yutar)

4. **Login page** (`(admin)/login/page.tsx`)
   - Cookie varsa + `/api/v1/me` 200 → `?next=` path'ine redirect
   - Cookie yoksa veya me 401 → form render

### Server action pattern (CSRF + cookie forwarding)

Browser tarafında server action form submit edildiğinde:
1. Next.js `/api/v1/auth/csrf`'i `internal: true` ile çağırır (request cookie header forward edilir)
2. Django `Set-Cookie: qr_csrftoken=...` döner
3. Next.js server action POST `/api/v1/auth/login`'a `X-CSRFToken` header'ı + cookie header'la fetch eder
4. Backend `Set-Cookie: qr_sessionid=...` + refreshed `qr_csrftoken` döner
5. Server action response headers'tan `Set-Cookie`'leri parse edip browser jar'ına yazar (`cookies().set(...)`)
6. `redirect(nextPath)` → middleware session cookie'yi görür, dashboard render olur

**Önemli:** `Set-Cookie` forward olmadan browser'a session cookie hiç ulaşmaz ve login
"çalışmıyor gibi" görünür. Bu pattern'i `_actions/auth.ts`'te merkezileştirdik.

### Logout

`logoutAction` her durumda `/login`'e redirect eder (network hatası olsa bile).
Browser cookie'leri (`qr_sessionid`, `qr_csrftoken`) idempotent olarak temizlenir.

## Part 4B İçin Hazırlık

4B worker'ı için bırakılan tüm altyapı:

| Hazır | Tekrar kullanılacak |
|---|---|
| `lib/api-admin.ts` — pattern'i genişlet | menus / categories / items endpoint'leri için `adminFetch` wrapper |
| `types/admin.ts` — model'ler hazır | AdminMenu, AdminMenuCategory, AdminMenuItem, Allergen, DietaryTag zaten tanımlı |
| `_components/FormField.tsx` | Tüm 4B form'larında label + input + error için |
| `_components/EmptyState.tsx` + `ErrorState.tsx` | Menus/categories/items listeleri için |
| `_components/AdminSidebar.tsx` | `Menüler` link'i zaten var, `comingSoon` flag'i kaldırılacak + yeni alt-nav eklenecek |
| `_components/AdminHeader.tsx` | Breadcrumb menü listesine otomatik genişler |
| `admin/layout.tsx` auth check pattern | 4B'nin tüm sayfaları bu layout'tan geçer, ek auth kodu yazmaya gerek yok |
| `next/headers` cookie forwarding pattern | Tüm RSC fetch'leri aynı `internal: true + cookieHeader` desenini kullanır |

### 4B'ye geçerken açılacak TODO'lar

1. `Menüler` sidebar nav'ından `comingSoon` flag'i kaldır (`AdminSidebar.tsx`)
2. `MenusViewSet` için `fetchMenus`, `createMenu`, `updateMenu`, `deleteMenu` wrapper'ları (`api-admin.ts`'e ekle)
3. Menu list page (`(admin)/admin/menus/page.tsx`) — `EmptyState` + "Yeni menü" CTA
4. Menu detail page (`(admin)/admin/menus/[menuId]/page.tsx`) — categories + items tree
5. `AllergenSelector` + `DietaryTagSelector` + `ImageUpload` + `TranslationTabs` component'leri
6. Price inline edit (DRF `PATCH /menu-items/{id}/` — price field)
7. Active/passive toggle (`PATCH` `is_active` flag)
8. Backend test genişletmesi (yok — sadece frontend işi)

### Bilinen sınırlamalar

- **Auth expire UX yok:** Session expire olunca layout sessizce `/login`'e atıyor; toast/mesaj yok. Sprint 5'te eklenebilir.
- **`/admin/organizations/current` endpoint'i yok:** Sprint plan doc'unda belirtilen `/current` endpoint'i aslında yok (router'da sadece list var). `fetchCurrentOrganization()` `fetchOrganizations()[0]` kullanıyor — tek-org kullanıcılar için OK, çoklu org için Sprint 4C'de seçici dropdown eklenmeli.
- **Multi-org / multi-branch desteği:** V1'de tek org / tek branch varsayılıyor. Header'a branch switcher eklenmedi.
- **CSRF cookie SameSite=Lax:** Cross-site form submit'lerde login çalışmaz. V1'de admin paneli public URL'den erişilmediği için sorun yok.
- **No audit log:** Plan'da 4C olarak işaretlendi.

## V1 Dışı Kalan (Sprint 4B / 4C / 5+)

- Online ödeme, sipariş, müşteri hesabı, AI menü import, push notification
- QR generation backend (Sprint 5)
- Image upload cloud storage (Sprint 5) — şimdilik local MEDIA_ROOT
- Analytics (Sprint 5)
- Audit log (4C)
- Admin summary endpoint (4C) — dashboard placeholder istatistikleri dolduracak

## Çalışma Süresi

~50 dakika (working session, 14:30 → 15:25 local time).
Auth expire riski tetiklenmedi — kapsam tam zamanında tamamlandı.
