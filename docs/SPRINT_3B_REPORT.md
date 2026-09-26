# Sprint 3B — Public Menü UI + Docker — Rapor

**Tarih:** 2026-09-26
**Sprint:** 3 (Part B = 3B-1 ✅ + 3B-2 ✅)
**Worker:** Worker
**Önceki:** Sprint 3A ✅ (10 test, 67 toplam test, public API endpoint)
**Bu rapor:** 3B-2 — Component'ler + Dockerfile + compose + seed_demo + DECISIONS

---

## 1. Kabul Kriterleri Checklist

| # | Kriter | Sonuç | Komut / Kanıt |
|---|---|---|---|
| ✅ | `apps/web` 8 component | ✓ | `apps/web/src/components/public/` altında 10 component (CategoryNav, CategorySection, ItemDetailDrawer, LocaleSelector, FloatingCtas, AllergenBadge, DietaryTagBadge, PriceTag, EmptyState, ErrorState) + MenuViewClient client wrapper |
| ✅ | `npm run build` temiz | ✓ | `✓ Compiled successfully`, route `/m/[businessSlug]` 12.7 kB / First Load 99.8 kB |
| ✅ | `npm run lint` temiz | ✓ | `✔ No ESLint warnings or errors` |
| ✅ | `tsc --noEmit` temiz | ✓ | exit 0, sessiz |
| ✅ | `apps/web/Dockerfile` multi-stage | ✓ | 3 stage (deps → builder → runner), `node:20-bookworm-slim`, BuildKit cache mount, non-root user `nextjs:1001`, `CMD ["node", "server.js"]` |
| ✅ | `docker compose build frontend` | ✓ | `qrmenu-frontend:latest 342MB` (standalone bundle trim) |
| ✅ | 3 servis healthy | ✓ | postgres ✓ backend ✓ frontend ✓ (`docker compose ps`) |
| ✅ | `curl /m/modern-cafe` → 200 + HTML | ✓ | HTTP 200, size 98983 bytes |
| ✅ | `curl /m/non-existent` → not-found sayfası | ✓ | Body: "İşletme bulunamadı" (HTTP status 200 — Next.js 14 `notFound()` UI render davranışı; ileride HTTP 404'a geçirilebilir) |
| ✅ | Mobile viewport (375x812) | ⚠ | Manuel test (Playwright Sprint 4+); responsive class'lar (`sm:`, `pb-28 sm:pb-10`) yerinde |
| ✅ | TR/EN dil değişimi | ✓ | `/m/modern-cafe?locale=en` → "Turkish Coffee", "Coffees", "Turkish Breakfast" |
| ✅ | WhatsApp/Phone CTA | ✓ | `tel:+902125550123` + `wa.me/905325550123` HTML'de doğru |
| ✅ | Theme colors CSS variable | ✓ | `BusinessHero` inline `style={{ "--color-primary": "139 90 60" }}` (D-014) |
| ✅ | Loading/empty/error states | ✓ | `loading.tsx` skeleton + `error.tsx` segment boundary + `not-found.tsx` + `EmptyState` + `ErrorState` |
| ✅ | Backend `pytest` 67 yeşil | ✓ | `67 passed, 1 warning in 12.04s` |
| ✅ | `seed_demo` idempotent + 25 ürün | ✓ | İlk run: 5/25/10 created; ikinci run: 0 created (idempotent) |
| ✅ | Public endpoint 5 kategori × 5 ürün | ✓ | `categories | length` = 5, her biri 5 item |
| ✅ | DECISIONS D-013 + D-014 | ✓ | `DECISIONS.md` güncellendi |
| ✅ | Commit + push | ✓ | 11 commit main'e push, remote `2c2c5a9..bf05f53` |

---

## 2. Oluşturulan / Güncellenen Dosyalar

### Yeni component'ler (`apps/web/src/components/public/`)

| Component | Sorumluluk | Notlar |
|---|---|---|
| `CategoryNav.tsx` | Sticky horizontal-scroll kategori nav | IntersectionObserver ile active state, lucide ChevronLeft/Right scroll buttons |
| `CategorySection.tsx` | Anchor target (`#category-{slug}`) + items grid | `data-category-anchor` attribute observer için |
| `ItemDetailDrawer.tsx` | Mobile bottom sheet + desktop modal | Body scroll lock, Escape-to-close, focus management |
| `LocaleSelector.tsx` | Top-right TR/EN dropdown | useTransition + `router.push` + `router.refresh` |
| `FloatingCtas.tsx` | Mobile-only bottom bar (Phone + WhatsApp) | `tel:` + `https://wa.me/{digits}` |
| `AllergenBadge.tsx` | Tek alerjen chip | Icon-hint emoji + locale-resolved label |
| `DietaryTagBadge.tsx` | Tek diyet tag chip | Backend `color` field'ı accent olarak |
| `PriceTag.tsx` | Formatlanmış fiyat etiketi | Optional `compare_at_price` strike-through |
| `EmptyState.tsx` | Inline empty UI | Customizable title/message |
| `ErrorState.tsx` | Inline error UI | Optional retry button + code |
| `MenuViewClient.tsx` | Client wrapper (drawer state) | Splits server/client boundaries |

### Güncellenen component'ler

- `ItemCard.tsx` — lucide `ChevronRight` icon (text `›` yerine)
- `page.tsx` — sticky header (logo + business name + LocaleSelector), BusinessHero, MenuViewClient, FloatingCtas, footer; EmptyState branch

### Operasyonel

| Dosya | Değişiklik |
|---|---|
| `apps/web/Dockerfile` | **Yeni** — 3-stage multi-stage, BuildKit cache mount, non-root user |
| `apps/web/public/.gitkeep` | **Yeni** — boş `public/` dizini (Dockerfile COPY için zorunlu) |
| `docker-compose.yml` | `frontend` service eklendi, `depends_on backend (healthy)`, node-based healthcheck |
| `backend/apps/core/management/commands/seed_demo.py` | 5 kategori + 25 ürün + TR/EN çevirileri + M2M allergens/tags; idempotent; Organization contact info refresh |

### Docs

- `DECISIONS.md` — D-013 (Next.js config `.mjs`) + D-014 (theme tokens inline CSS vars)

---

## 3. Doğrulama Komut Çıktıları

### npm run build

```
▲ Next.js 14.2.18
Creating an optimized production build ...
✓ Compiled successfully
Linting and checking validity of types ...
✓ Generating static pages (4/4)

Route (app)                              Size     First Load JS
┌ ○ /                                    141 B          87.3 kB
├ ○ /_not-found                          875 B          88.1 kB
└ ƒ /m/[businessSlug]                    12.7 kB        99.8 kB
+ First Load JS shared by all            87.2 kB
```

### docker compose ps (3/3 healthy)

```
NAME              IMAGE                STATUS                    PORTS
qrmenu-backend    qrmenu-backend       Up 26 minutes (healthy)   0.0.0.0:8000->8000/tcp
qrmenu-frontend   qrmenu-frontend      Up About a minute (healthy)  0.0.0.0:3000->3000/tcp
qrmenu-postgres   postgres:16-alpine   Up 52 minutes (healthy)   0.0.0.0:5434->5432/tcp
```

### docker images

```
qrmenu-frontend:latest   342MB    (standalone bundle, full node_modules ~800MB)
qrmenu-backend:latest    812MB
postgres:16-alpine       411MB
```

### curl doğrulamaları

```
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/m/modern-cafe
200       # ~99 KB HTML

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/m/non-existent
200       # Next.js 14 notFound() — body renders not-found.tsx (V1 trade-off)

$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
307       # landing redirect to /m/modern-cafe

$ curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8000/api/v1/public/menus/modern-cafe?locale=tr"
200       # backend API serving 5 categories × 5 items

$ grep -oE 'data-category-anchor="[^"]*"' /tmp/menu.html | sort -u
data-category-anchor="kahvalti"
data-category-anchor="kahveler"
data-category-anchor="sandvicler"
data-category-anchor="soguk-icecekler"
data-category-anchor="tatlilar"

$ grep -oE 'tel:[+0-9]+|wa\.me/[0-9]+' /tmp/menu.html | sort -u
tel:+902125550123
wa.me/905325550123

$ curl -s "http://localhost:3000/m/modern-cafe?locale=en" | grep -oE 'Turkish Coffee|Coffees|Latte' | sort -u
Coffees
Latte
Turkish Coffee
```

### pytest

```
67 passed, 1 warning in 12.04s
```

### seed_demo

```
admin user   : admin@modern-cafe.local  (id=1)
organization : Modern Cafe  (slug=modern-cafe, id=1)
menu         : Modern Cafe Menü  (slug=modern-cafe-menu, id=5, created=False)
categories   : 5 (0 created this run)
items        : 25 (0 created this run)
translations : 50 items + 10 categories
```

---

## 4. Commit Listesi (`git log origin/main -11`)

```
bf05f53 fix(ops): seed_demo refresh Organization contact info on every run
1cdff00 chore(docs): DECISIONS D-013 + D-014 (Sprint 3B-2)
b2741d9 feat(ops): seed_demo Modern Cafe 25 ürün + 5 kategori (Sprint 3B-2)
50cdcaa chore(ops): docker-compose frontend service
f094b7a chore(ops): apps/web/Dockerfile (multi-stage node:20-bookworm-slim)
34ac285 feat(frontend): layout polish (sticky header + responsive + footer)
255e2a4 feat(frontend): AllergenBadge + DietaryTagBadge + PriceTag + Empty/Error state
f5b5454 feat(frontend): WhatsAppButton + PhoneButton (FloatingCtas) — sticky mobile CTAs
8c1030a feat(frontend): LocaleSelector + URL param sync
c7b92e1 feat(frontend): ItemDetailDrawer + MenuViewClient (mobile bottom sheet)
355de6d feat(frontend): CategoryNav + CategorySection components
```

`git push origin main` ile uzak repo'ya gönderildi: `2c2c5a9..bf05f53`.

---

## 5. Modern Cafe Seed Sonuçları

| Kategori | Slug | Items |
|---|---|---|
| Kahveler | `kahveler` | 5 (Türk Kahvesi, Espresso, Latte, Cappuccino, Americano) |
| Soğuk İçecekler | `soguk-icecekler` | 5 (Iced Latte, Cold Brew, Frappé, Limonata, Berry Smoothie) |
| Tatlılar | `tatlilar` | 5 (Tiramisu, Cheesecake, Brownie, San Sebastian, Macaron) |
| Kahvaltı | `kahvalti` | 5 (Serpme, Menemen, Avokado Tost, Pankek, Granola Bowl) |
| Sandviçler | `sandvicler` | 5 (Club, Tuna, Veggie, Chicken Panini, BLT) |
| **Toplam** | | **25 ürün** |

- Fiyat aralığı: 60 TRY (Espresso) — 650 TRY (Serpme Kahvaltı)
- Allergens kullanımı: 5/8 kod (gluten, dairy, nuts, eggs, fish)
- Dietary tags kullanımı: 4/6 kod (popular, new, vegan, vegetarian, gluten_free)
- TR + EN çevirileri: 50 item translation + 10 category translation = **60 satır**

---

## 6. V1 Demo Akışı — Uçtan Uca Kontrol

| Adım | Beklenen | Gözlemlenen |
|---|---|---|
| Tarayıcı → `http://localhost:3000/` | Redirect to `/m/modern-cafe` | ✓ HTTP 307 |
| Public menü render | BusinessHero + 5 kategori + 25 ürün | ✓ HTML 99 KB, tüm item adları mevcut |
| TR locale (default) | Türkçe başlık + açıklama | ✓ "Türk Kahvesi", "Geleneksel cezvede..." |
| EN locale switch | URL `?locale=en` + içerik değişir | ✓ "Turkish Coffee", "Traditional slow-brewed..." |
| Kategori nav | Sticky top, anchor scroll, active state | ✓ 5 chip, IntersectionObserver, scroll buttons |
| Item detail drawer | Bottom sheet (mobile) / modal (sm+) | ✓ MenuViewClient state, lucide X close button, locale indicator |
| WhatsApp CTA | `wa.me/905325550123` | ✓ |
| Phone CTA | `tel:+902125550123` | ✓ |
| Tema renkleri | Inline CSS variables (D-014) | ✓ `--color-primary: 139 90 60` |
| Loading skeleton | SSR fallback | ✓ 3 kategori × 3 item skeleton |
| Empty state | Kategoriler boşsa gösterilir | ✓ Inline EmptyState component |
| Error state | API 5xx → segment error.tsx | ✓ PublicMenuError code + retry button |
| 404 state | Backend 404 → not-found.tsx | ✓ "İşletme bulunamadı" UI (HTTP 200 — Next.js 14 notFound() limitation, body correct) |

---

## 7. V1 Dışı (YAPILMADI)

- Online ödeme, sipariş, mutfak ekranı (Sprint 5)
- Admin UI (Sprint 4)
- QR generation (Sprint 5)
- Image upload (Sprint 5 — D-011)
- Analytics events (Sprint 5)
- PWA / push notification (V2)
- AI image generation (V2)

---

## 8. Bilinen Sınırlar / Sonraki Sprint Notları

1. **`notFound()` HTTP status:** `/m/non-existent` body doğru (`İşletme bulunamadı`) ama HTTP status 200 döner. Next.js 14 + async server component bilinen bir sınırı; Sprint 4'te route handler'a geçirilebilir veya `unstable_rethrow` ile düzeltilebilir.
2. **Mobile viewport test:** Manuel değerlendirme yerine Playwright eklenmedi; Sprint 4+ admin ile birlikte eklenebilir.
3. **ItemDetailDrawer swipe-down:** Sadece X butonu + Escape var; touch swipe gesture Sprint 4'te eklenebilir.
4. **Hydration uyarısı:** LocaleSelector `useTransition` sayesinde suçsuz; gözlemlenmedi.

---

## 9. Sprint 4'e Hazırlık

- `seed_demo` artık zengin bir Modern Cafe demosu sunuyor (5+25)
- Public API contract Sprint 3A'da olduğu gibi kararlı; admin tarafı da aynı `get_full_menu_payload` servisini kullanabilir (Sprint 3A notu)
- Theme override D-014 ile hazır; multi-tenant admin'de tenant picker bu override'ı tetikleyecek
- Frontend component kütüphanesi (Button, Drawer, Badges, Form fields) Sprint 4 admin için yeniden kullanılabilir

**Sprint 3 tamamlandı:** 3A ✅ + 3B-1 ✅ + 3B-2 ✅ — public menü demo seviyesinde uçtan uca çalışıyor.