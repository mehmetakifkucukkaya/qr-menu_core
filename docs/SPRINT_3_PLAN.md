# Sprint 3 — Public API + Public Menü UI — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 3 (3-4 gün, planlanan ~100-120 saat)
**Durum:** Planlandı → worker'a verildi
**Önceki:** Sprint 2 ✅ (23 commit, 57 test, menü domain backend hazır, `get_full_menu_payload` servisi yazılı)

## Amaç

Mobil-first public QR menü deneyimi demo seviyesine gelir. Müşteri QR okutur → public menü açılır → kategori/ürün gezilir → dil değiştirilir → WhatsApp/telefon CTA kullanılır.

## Alınan Kararlar (Sprint 0-2'den miras)

- D-001..D-012 + OP-1..OP-11 (Sprint 0..2'den)
- **D-007:** Frontend container `node:20-bookworm-slim` (multi-stage builder + runner)
- **D-003:** Tek Next.js app + route group `(public)` ve `(admin)`
- **OP-5:** Admin auth SessionAuth; Sprint 3 sadece public route, admin Sprint 4'te
- **Sprint 2 hazırlığı:** `get_full_menu_payload(organization, locale, branch)` servisi zaten yazılı — Sprint 3'te sadece endpoint + cache eklenir

## Backend (küçük) — Public API

### Yeni: `apps/menu/views_public.py`

```python
class PublicMenuView(APIView):
    """GET /api/v1/public/menus/{business_slug}?branch=<slug>&locale=<tr|en>"""
    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]   #  60/dakika (Sprint 5'te analytics için yükseltilebilir)

    def get(self, request, business_slug):
        branch_slug = request.query_params.get('branch')
        locale = request.query_params.get('locale', 'tr')

        org = Organization.objects.filter(slug=business_slug, is_active=True).first()
        if not org:
            return Response({'error': {'code': 'business.not_found', 'message': 'İşletme bulunamadı.'}}, status=404)

        branch = None
        if branch_slug:
            branch = org.branches.filter(slug=branch_slug, is_active=True).first()

        payload = get_full_menu_payload(org, locale=locale, branch=branch)
        if not payload:
            return Response({'error': {'code': 'menu.not_found', 'message': 'Aktif menü yok.'}}, status=404)

        return Response({'data': payload, 'meta': {'request_id': request.META.get('HTTP_X_REQUEST_ID', '')}})
```

### Throttle

```python
# config/settings/base.py
REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_CLASSES': ['rest_framework.throttling.AnonRateThrottle'],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/min',   # public endpoint için
    }
}
```

### Cache (V1'de basit, Sprint 5'te iyileştirilir)

V1'de cache yok (Redis opsiyonel). Production'da Cloudflare cache layer eklenecek. Şimdilik her istek DB'den, ama `get_full_menu_payload` sorgu optimizasyonlu (select_related, prefetch_related).

### Tests (backend)

- `apps/menu/tests/test_public_api.py`
  - test_public_menu_returns_active_business_payload
  - test_public_menu_inactive_business_returns_404
  - test_public_menu_no_active_menu_returns_404
  - test_public_menu_locale_tr_returns_turkish_translations
  - test_public_menu_locale_en_with_partial_translations_falls_back
  - test_public_menu_branch_filter
  - test_public_menu_pasif_category_excluded
  - test_public_menu_pasif_item_excluded
  - test_public_menu_throttle_60_per_minute
  - test_public_menu_unavailable_item_shows_flag_but_visible (görünür ama "tükendi" badge'i)

## Frontend — Next.js 14 App + Route Group

### Yeni: `apps/web/`

```
apps/web/
├── Dockerfile                (multi-stage: builder → runner)
├── .dockerignore
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── public/
│   ├── favicon.ico
│   └── (placeholder assets)
└── src/
    ├── app/
    │   ├── layout.tsx           (root layout)
    │   ├── page.tsx             (landing → /m/modern-cafe redirect)
    │   ├── globals.css          (Tailwind base + CSS variables)
    │   ├── (public)/
    │   │   └── m/
    │   │       └── [businessSlug]/
    │   │           ├── page.tsx              (public menü server component)
    │   │           ├── loading.tsx           (skeleton)
    │   │           ├── error.tsx             (error boundary)
    │   │           └── not-found.tsx         (404)
    │   └── (admin)/            (placeholder, Sprint 4'te dolar)
    │       └── layout.tsx      (boş)
    ├── components/
    │   ├── public/
    │   │   ├── BusinessHero.tsx        (logo + cover + business info)
    │   │   ├── CategoryNav.tsx         (sticky horizontal scroll)
    │   │   ├── CategorySection.tsx     (anchor target)
    │   │   ├── ItemCard.tsx            (image + name + price + tags)
    │   │   ├── ItemDetailDrawer.tsx    (mobile drawer)
    │   │   ├── AllergenBadge.tsx       (icon + tooltip)
    │   │   ├── DietaryTagBadge.tsx     (icon + color)
    │   │   ├── LocaleSelector.tsx      (TR/EN switch)
    │   │   ├── WhatsAppButton.tsx      (CTA floating)
    │   │   ├── PhoneButton.tsx         (CTA)
    │   │   ├── PriceTag.tsx            (formatted price)
    │   │   ├── EmptyState.tsx
    │   │   └── ErrorState.tsx
    │   └── ui/
    │       ├── Button.tsx              (şimdilik inline, Sprint 4'te polish)
    │       └── Skeleton.tsx
    ├── lib/
    │   ├── api.ts             (fetch wrapper, error handling, request_id)
    │   ├── locale.ts          (cookie + URL param + fallback)
    │   ├── format.ts          (price formatter, slug to title)
    │   └── placeholder.ts     (fallback görsel URL generator)
    ├── types/
    │   └── menu.ts            (TypeScript types from API contract)
    └── styles/
        └── tokens.css         (CSS variables for theme)
```

### Frontend Stack

- **Next.js:** 14.2.x (App Router stable)
- **React:** 18.3
- **TypeScript:** 5.x strict mode
- **Tailwind:** 3.4.x
- **lucide-react:** 0.x (ikonlar)
- **clsx:** (conditional classNames)
- **Zustand:** (minimal client state — locale, drawer state)

### Theme Tokens

```css
/* apps/web/src/styles/tokens.css */
:root {
  --color-primary: #8B5A3C;
  --color-secondary: #D4A574;
  --color-accent: #E07856;
  --color-background: #F5EFE6;
  --color-text: #2C1810;
  --font-heading: 'Playfair Display', serif;
  --font-body: 'Inter', sans-serif;
  --radius: 0.5rem;
}
```

`get_full_menu_payload`'daki theme bilgisi CSS variable'ları override eder (component içinde inline style ile).

### API Client (`lib/api.ts`)

```typescript
export async function fetchPublicMenu(
  businessSlug: string,
  options: { branch?: string; locale?: string } = {}
): Promise<PublicMenuPayload> {
  const params = new URLSearchParams();
  if (options.branch) params.set('branch', options.branch);
  if (options.locale) params.set('locale', options.locale);

  const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';
  const url = `${base}/api/v1/public/menus/${businessSlug}?${params}`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new PublicMenuError(res.status, error?.error?.code || 'unknown', error?.error?.message || 'Bilinmeyen hata');
  }
  const { data } = await res.json();
  return data;
}
```

### Mobile-First UI Prensipleri

- `min-h-screen` + sticky header (logo + locale selector + CTA)
- 360px viewport test edilebilir
- Touch target min 44x44px
- Horizontal scroll kategori nav (overflow-x-auto, snap-x)
- Bottom-sheet drawer pattern (item detail)
- Sticky CTA: WhatsApp + Phone (mobile only)
- Skeleton loading
- Pull-to-refresh opsiyonel (V2)

### Components Detay

**BusinessHero.tsx:**
- Cover image (full-width, h-48)
- Logo (centered, -mt-12 overlap)
- Business name (h1, font-heading)
- Description (max 2 line clamp)
- Address (with map link optional)

**CategoryNav.tsx:**
- Sticky top (top-16)
- Horizontal scroll with snap
- Active category indicator (background color)
- Smooth scroll on click

**ItemCard.tsx:**
- Image (16:9 aspect)
- Name + short description
- Price (right-aligned)
- Badges: popular/new/featured (color coded)
- Allergen icons (subtle, bottom)
- Click → drawer open

**ItemDetailDrawer.tsx:**
- Mobile: bottom sheet (animate-in)
- Desktop: centered modal (md: only)
- Full description
- Allergens + dietary tags
- Price + currency
- Close button + swipe-down

**LocaleSelector.tsx:**
- Top-right, dropdown
- TR / EN flag/text
- Updates URL param + cookie
- Triggers re-fetch (router.refresh)

**Placeholder strategy (lib/placeholder.ts):**
```typescript
export function getItemImageUrl(item: PublicMenuItem): string {
  if (item.image) return item.image;
  // Fallback: SVG data URL with gradient + emoji
  const emoji = item.emoji_hint || '🍽️';
  const color = item.color_hint || '#D4A574';
  return `data:image/svg+xml,...`;
}
```

### Routing

- `/m/[businessSlug]` → public menü sayfası
- Root `/` → `redirect('/m/modern-cafe')` (demo için)
- 404 → özel sayfa (işletme bulunamadı mesajı + WhatsApp CTA)

### Environment Variables

```bash
# apps/web/.env.local (veya docker-compose env)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000   # browser → backend
INTERNAL_API_BASE_URL=http://backend:8000        # server component → backend (docker network)
```

Next.js'te `NEXT_PUBLIC_*` browser bundle'a dahil olur. Server component'te `INTERNAL_API_BASE_URL` kullanılır (Docker network içinde direkt backend:8000'e gider).

### Tests

Frontend test minimal (V1 demo için):
- TypeScript strict mode (compile-time type check)
- Tailwind build (CSS extraction)
- Next.js build (production build başarılı)
- Manual smoke test: `/m/modern-cafe` açılır, kategoriler gezilir, dil değişir, drawer açılır

V2'de Playwright eklenebilir. V1'de manuel test + Lighthouse yeterli.

### Docker Setup

**apps/web/Dockerfile (multi-stage):**
```dockerfile
# syntax=docker/dockerfile:1.4
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISCH=1
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISCH=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
```

**next.config.ts:**
```typescript
{
  output: 'standalone',  // Docker için minimal bundle
  reactStrictMode: true,
  images: { remotePatterns: [...] },
}
```

**docker-compose.yml güncelleme:**
- `frontend` eklenecek (build: ./apps/web, port 3000:3000, depends_on backend)
- Backend `depends_on postgres` korunur
- `internal` network oluşturulur (frontend → backend)

## Commit Planı (~16 commit)

```
chore(frontend): Next.js app scaffold (package.json, tsconfig, tailwind, postcss)
feat(frontend): root layout + globals.css + landing redirect
feat(frontend): API client (lib/api.ts) + TypeScript types
feat(backend): public menu endpoint + URL routing
feat(backend): AnonRateThrottle + throttle rates config
feat(backend): public menu tests (10 test)
feat(frontend): BusinessHero component + theme tokens
feat(frontend): CategoryNav component (sticky horizontal scroll)
feat(frontend): ItemCard + PriceTag components
feat(frontend): ItemDetailDrawer component (mobile bottom sheet)
feat(frontend): AllergenBadge + DietaryTagBadge components
feat(frontend): LocaleSelector component (TR/EN switch)
feat(frontend): WhatsAppButton + PhoneButton CTAs
feat(frontend): placeholder image strategy (lib/placeholder.ts)
feat(frontend): public route page.tsx + loading.tsx + error.tsx + not-found.tsx
feat(frontend): theme tokens override (CSS variables from payload)
chore(ops): frontend Dockerfile (multi-stage) + docker-compose frontend service
chore(docs): DECISIONS D-13/D-14 + Sprint 3 report
```

## V1 Dışı (YAPMA)

- Online ödeme, sipariş, garson çağırma, mutfak ekranı, POS, rezervasyon, müşteri hesabı, sadakat
- Admin UI (Sprint 4)
- QR generation (Sprint 5)
- Image upload (Sprint 5)
- Analytics events (Sprint 5)
- PWA / offline mode (V2)
- AI image generation tool keşfi (Sprint 6'da)
- Push notification (V2)

## Kabul Kriterleri (her biri kanıtlanmalı)

✅ Backend: `GET /api/v1/public/menus/modern-cafe?locale=tr` → 200 + tam payload
✅ Backend: `GET /api/v1/public/menus/non-existent` → 404 + business.not_found
✅ Backend: Pasif işletme → 404
✅ Backend: Pasif kategori/ürün payload'da yok
✅ Backend: `locale=en` ile TR çeviri varsa EN, yoksa TR fallback
✅ Backend: throttle 60/dakika (61. istek → 429)
✅ Backend: pytest 67+ test yeşil (57 + 10 yeni public API test)
✅ Frontend: `cd apps/web && npm run build` başarılı (TypeScript strict, ESLint clean)
✅ Frontend: `docker compose up -d` ile 3 servis (postgres + backend + frontend) healthy
✅ Frontend: `curl http://localhost:3000/m/modern-cafe` → 200 + HTML
✅ Frontend: Mobile viewport (375x812) screenshot → kategoriler görünür, drawer açılır
✅ Frontend: TR/EN dil değişimi çalışır (URL param `?locale=en`)
✅ Frontend: WhatsApp/Phone CTA `tel:` ve `https://wa.me/` doğru numaraya yönlendirir
✅ Frontend: Theme colors CSS variable olarak uygulanır (Modern Cafe palette)
✅ Frontend: Loading skeleton + error state + empty state render olur
✅ Commit'ler main'e push (her mantıksal grup ayrı)

## Çalıştırma Adımları (Worker)

1. Repo'da Sprint 1+2 commit'leri yerinde mi kontrol et
2. docs/SPRINT_3_PLAN.md oku
3. Backend:
   a. `apps/menu/views_public.py` yaz
   b. `apps/menu/urls.py` güncelle (public route ekle)
   c. `apps/menu/permissions.py` AllowAny için import
   d. Throttle config (`config/settings/base.py`)
   e. tests/test_public_api.py (10 test)
4. Frontend:
   a. `apps/web/` scaffold (mkdir + package.json + tsconfig + tailwind + postcss)
   b. `npm install` (veya docker build sırasında)
   c. `src/app/layout.tsx` + `globals.css` + landing redirect
   d. `src/lib/api.ts` + `src/types/menu.ts`
   e. Components (BusinessHero, CategoryNav, ItemCard, ItemDetailDrawer, LocaleSelector, CTAs, Badges)
   f. `src/app/(public)/m/[businessSlug]/page.tsx` + loading/error/not-found
   g. Theme tokens + CSS variables
   h. Placeholder strategy
5. Docker:
   a. `apps/web/Dockerfile` (multi-stage)
   b. `apps/web/.dockerignore`
   c. `docker-compose.yml` frontend service ekle
6. Local doğrulama:
   a. `docker compose build` (backend + frontend)
   b. `docker compose up -d`
   c. `docker compose ps` → 3 servis healthy
   d. `curl http://localhost:8000/api/v1/public/menus/modern-cafe?locale=tr` → 200
   e. `curl http://localhost:3000/m/modern-cafe` → 200
   f. `docker compose exec backend pytest -v` → 67+ yeşil
   g. `cd apps/web && npm run build` → başarılı
7. DECISIONS.md güncelle (D-13: Next.js output standalone, D-14: theme tokens via inline CSS variables)
8. docs/SPRINT_3_REPORT.md oluştur
9. Commit + push

## Rapor (Sprint 1-2 formatında)

1. Kabul kriteri checklist (16+ madde, ✅/❌ + komut + çıktı)
2. Oluşturulan dosya listesi (backend + frontend)
3. Doğrulama komut çıktıları (pytest, curl, npm run build, mobile viewport)
4. Commit listesi (`git log --oneline -20 origin/main`)
5. TODO / V1-dışı
6. Sprint 4'e hazırlık notu (admin panel başlangıcı)

## Notlar

- Frontend ilk kez başlıyor — package.json, tsconfig, tailwind.config, postcss.config, .dockerignore hepsi yeni
- Docker build süresi frontend için 2-3 dakika olabilir (npm install)
- npm cache mount ile BuildKit cache aktif
- `apps/web/.env.local` git'e eklenmez (`.gitignore`'da zaten var)
- Mobile viewport test: Playwright değil manuel — V1 demo için yeterli; Lighthouse CI opsiyonel Sprint 4+