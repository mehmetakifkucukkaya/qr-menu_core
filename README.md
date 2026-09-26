# QR Menü — qr-menu_core

**QR Menü / Restoran Mini Sistem V1** — mobil-first dijital menü, admin panel, QR kod, çoklu dil, tema ve basit analytics.

> Bu repo **V1'in uygulama repo'sudur**. Plan, PRD, sprint ve karar dokümanları `myagency/product-plans/qr-menu/` altındadır. Mimari kararlar için [`DECISIONS.md`](./DECISIONS.md) referans alınır.

## Hızlı Bakış

| Konu | Seçim |
|---|---|
| Backend | Django 5.x + Django REST Framework |
| Frontend | Next.js 14+ (tek app + `(public)` / `(admin)` route group) |
| Veritabanı | PostgreSQL 16 |
| Deploy | Docker Compose · Hetzner VPS · Cloudflare DNS · Caddy |
| Demo işletme | Modern Cafe (5+ kategori, 25+ ürün) |
| Dil | TR / EN (fallback: organization.default_locale) |
| API contract | `docs/API_CONTRACT.md` (Sprint 1'de oluşur) |

## Repo Yapısı

```
agency-qr-menu/
├── README.md
├── LICENSE                 (MIT)
├── DECISIONS.md            (mimari kararlar)
├── .env.example
├── .gitignore
├── docker-compose.yml      (local)
├── docker-compose.production.yml
├── backend/                (Django + DRF)
│   ├── pyproject.toml
│   ├── manage.py
│   ├── config/
│   │   └── settings/{base,local,test,production}.py
│   └── apps/
│       ├── core/ accounts/ organizations/ branches/
│       ├── menu/ media/ theme/ qr/ analytics/ audit/ health/
│       └── ...
├── apps/
│   └── web/                (Next.js monorepo)
│       └── src/
│           ├── app/
│           │   ├── (public)/m/[businessSlug]/page.tsx
│           │   └── (admin)/{login,dashboard,menus,...}/page.tsx
│           ├── components/
│           ├── features/{public-menu,admin-dashboard,...}/
│           └── lib/
├── docs/
│   ├── API_CONTRACT.md
│   ├── DEPLOYMENT.md
│   ├── DEMO_SCRIPT.md
│   └── DEMO_IMAGES.md      (görsel envanteri)
└── scripts/
    └── seed_demo.py
```

## Sprint Planı (özet)

| Sprint | Süre | Amaç |
|---|---|---|
| 0 | 0.5-1 gün | Kararları netleştir — ✅ tamamlandı |
| 1 | 1-2 gün | Repo scaffold + Backend core (Django, PostgreSQL, Org, Branch, Theme, auth, health, Docker) |
| 2 | 2-3 gün | Menü domain backend (Menu, Category, Item, translation, allergen/tag, CRUD, reorder, fallback) |
| 3 | 3-4 gün | Public API + Public Menü UI (`/m/[businessSlug]`, mobile-first) |
| 4 | 3-4 gün | Admin Panel V1 |
| 5 | 2-3 gün | QR, Media, Analytics |
| 6 | 3-5 gün | Demo, Polish, QA, Deploy |

Detay: `product-plans/qr-menu/SPRINT_PLAN.md`.

## Geliştirme (Sprint 1 sonrası)

```bash
# Lokal geliştirme
docker compose up

# Backend health kontrolü
curl http://localhost:8000/health

# Test
docker compose exec backend pytest

# Lint/typecheck (frontend)
cd apps/web && npm run lint && npm run typecheck
```

## Lisans

MIT — see [`LICENSE`](./LICENSE).

## V1 Dışı (V2 adayları)

Online ödeme, masa siparişi, mutfak ekranı, garson çağırma, POS entegrasyonu, rezervasyon, müşteri hesabı, sadakat, AI menü import.