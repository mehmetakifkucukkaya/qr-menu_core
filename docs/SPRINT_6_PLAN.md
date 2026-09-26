# Sprint 6 — Deploy + Demo Polish + Production Docs — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 6 (3-5 gün, planlanan ~100-120 saat)
**Durum:** Planlandı → onay sonrası worker başlatılacak
**Önceki:** Sprint 1+2+3A+3B-1+3B-2+4A+4B+4C+5A+5B-1a+5B-1b+5B-2 ✅ (~92 commit, 121 backend test, V1 demo akışının frontend + backend tümü hazır)

## Amaç

V1 demo akışını production'a taşımak: production-grade deploy (Hetzner VPS + Caddy + Docker Compose), demo polish (logo + kapak AI üretimi + Modern Cafe tam seed), production docs (DEPLOYMENT.md, DEMO_SCRIPT.md, API_CONTRACT.md, troubleshoot runbook). V1 demo akışının uçtan uca ready olması.

## Sprint 6 Kararları (Önceden Alınan)

- **D-004:** Deploy = Hetzner VPS + Cloudflare DNS + Caddy
- **D-007:** Container Python 3.12-slim + Node 20-bookworm-slim multi-stage
- **D-011:** Image upload = local MEDIA_ROOT (Sprint 5A'da)
- **D-016:** AuditEvent + thread-local context
- **D-017:** Analytics (QR + events + overview)

## Sprint 6 Açık Kararları (Onay Bekliyor)

| ID | Karar | Önerme | Gerekçe |
|---|---|---|---|
| **OP-2** | Production domain | `menu.agencyqr.com` + `app.agencyqr.com` | placeholder, gerçek domain Sprint 6'da netleşir |
| **OP-3** | Hetzner VPS lokasyonu + boyut | NBG1 (Nürnberg) + CX22 (4GB RAM) | Avrupa, düşük maliyet, demo için yeterli |
| **OP-4** | DB backup stratejisi | pg_dump cron + Hetzner Storage Box offsite | günlük yedek, 7 gün retention |
| **OP-9** | Monitoring tool'u | Sentry SaaS (free tier) + Better Stack uptime (free) | demo için yeterli, V2'de self-hosted |

## Sprint 6 Parçaları (büyük sprint, 3 parçaya bölündü)

### Sprint 6A — Production Backend + Deploy (~45-60 dk)

**Kapsam:**
- `config/settings/production.py` genişletme (ALLOWED_HOSTS, CORS, CSRF_TRUSTED_ORIGINS, SECURE_SSL_REDIRECT, SECURE_HSTS_SECONDS, SESSION_COOKIE_SECURE)
- `backend/Dockerfile` prod target (gunicorn + collectstatic + static volume)
- `docker-compose.production.yml` (3 servis: postgres + backend + frontend + caddy, restart: unless-stopped)
- `Caddyfile` (HTTPS otomatik, domain → frontend + backend)
- `docs/DEPLOYMENT.md` (Hetzner VPS setup, DNS, deploy, rollback, troubleshooting)
- Production env validation (.env.production checklist)
- `requirements.txt` prod dependencies (gunicorn, sentry-sdk[fastapi] opsiyonel)

**Kabul:**
- `docker compose -f docker-compose.production.yml config` valid
- Backend production settings'de DJANGO_DEBUG=0, ALLOWED_HOSTS configured
- Caddyfile doğru route (frontend + backend)
- DEPLOYMENT.md çalıştırılabilir talimatlar

### Sprint 6B — Demo Polish + AI Görsel (~45-60 dk)

**Kapsam:**
- Modern Cafe demo seed kontrolü (5 kategori + 25 ürün + TR/EN — Sprint 5B-1a'da hazır)
- AI ile logo üret (mcode-tools multimodal — `mcode-tools connector tools --keyword image`)
- AI ile kapak üret (mcode-tools multimodal)
- AI görselleri `apps/web/public/demo-assets/` altına optimize edilmiş (WebP) kaydet
- Frontend logo/kapak'ı `IMAGE_FALLBACK_STRATEGY`'a uygun şekilde kullan
- `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` meta tags (title, description, OG, twitter)
- `apps/web/src/app/layout.tsx` favicon + viewport meta
- `apps/web/public/favicon.ico` (placeholder veya basit logo)
- `apps/web/public/og-image.png` (kapak görseli 1200x630 social share için)
- QR code oluştur (Modern Cafe için en az 5 QR — Kasa, Masa 1-4)
- Demo script (docs/DEMO_SCRIPT.md — 10 adımlık akış)
- `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` "Henüz görsel yok" fallback iyileştirmesi

**Kabul:**
- Logo + kapak AI ile üretildi, modern-cafe-logo.webp + modern-cafe-cover.webp mevcut
- Meta tags (title, description, OG, twitter) public page'de render oluyor
- Modern Cafe için 5 QR oluşturuldu
- DEMO_SCRIPT.md 10 adım akışı net

### Sprint 6C — Production Docs + Smoke + Lighthouse (~30-45 dk)

**Kapsam:**
- `docs/API_CONTRACT.md` (tüm backend endpoint'leri, request/response shape)
- `docs/TROUBLESHOOTING.md` (common issues: DB connection, env missing, cache clear)
- `docs/DEPLOYMENT.md` finalize (rollback, monitoring, alerting, runbook)
- V1 demo acceptance checklist (10 adım) — `docs/V1_ACCEPTANCE.md`
- Production smoke test script (`scripts/smoke_test.sh` — local'de çalıştırılabilir, 5 dakikada tüm akış)
- Lighthouse mobile score test (Playwright veya browser manual)
- DECISIONS D-018, D-019 (production settings + monitoring)

**Kabul:**
- API_CONTRACT.md tüm endpoint'leri kapsıyor (auth, public, admin, qr, media, analytics)
- TROUBLESHOOTING.md en az 10 common issue + fix
- V1_ACCEPTANCE.md 10 adım demo akışı checklist olarak işaretlenebilir
- smoke_test.sh exit 0 (tüm endpoint'ler erişilebilir, demo veri doğru)

## Backend Production Settings (`config/settings/production.py`)

```python
from .base import *  # noqa
import os

DEBUG = os.environ.get('DJANGO_DEBUG', '0') == '1'

# Allowed hosts — set in env (comma-separated)
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', '').split(',')

# CORS — frontend origin
CORS_ALLOWED_ORIGINS = os.environ.get('CORS_ALLOWED_ORIGINS', '').split(',')
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# SSL
SECURE_SSL_REDIRECT = True
SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Cookies secure in production
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# Static + media
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_ROOT = BASE_DIR / 'media'

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {'()': 'json_logging.JSONFormatter'},
    },
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'json'},
    },
    'loggers': {
        'django': {'handlers': ['console'], 'level': 'INFO'},
        'apps': {'handlers': ['console'], 'level': 'INFO'},
    },
}

# Analytics salt — unique per env
ANALYTICS_SALT = os.environ.get('ANALYTICS_SALT', 'CHANGE-ME-IN-PROD')

# Sentry
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration

if os.environ.get('SENTRY_DSN'):
    sentry_sdk.init(
        dsn=os.environ.get('SENTRY_DSN'),
        environment=os.environ.get('SENTRY_ENVIRONMENT', 'production'),
        integrations=[DjangoIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
```

## Docker Compose Production (`docker-compose.production.yml`)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: .env.production
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - backend-media:/app/media
      - backend-static:/app/staticfiles
    command: >
      sh -c "python manage.py migrate --noinput &&
             python manage.py collectstatic --noinput &&
             gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --access-logfile -"

  frontend:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_BASE_URL: ${NEXT_PUBLIC_API_BASE_URL}
      INTERNAL_API_BASE_URL: ${INTERNAL_API_BASE_URL}
    depends_on:
      - backend

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    depends_on:
      - frontend
      - backend

volumes:
  pgdata:
  backend-media:
  backend-static:
  caddy-data:
  caddy-config:
```

## Caddyfile

```caddyfile
{$DOMAIN:localhost} {
    reverse_proxy backend:8000
    reverse_proxy /m/* frontend:3000
    reverse_proxy /admin/* frontend:3000
    reverse_proxy /login* frontend:3000
    reverse_proxy /api/v1/admin/* backend:8000
    reverse_proxy /api/v1/auth/* backend:8000
    reverse_proxy /api/v1/me backend:8000
    reverse_proxy /media/* backend:8000
    reverse_proxy /static/* backend:8000
    reverse_proxy /health backend:8000
    encode gzip zstd
    header {
        # HSTS
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        # Security headers
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
    tls {$EMAIL}
}
```

## docs/DEPLOYMENT.md (Outline)

```markdown
# Production Deployment

## Prerequisites
- Hetzner CX22 VPS (4GB RAM, NBG1 region)
- Ubuntu 24.04 LTS
- Domain DNS pointing to VPS IP (A record menu.example.com → 1.2.3.4)
- Cloudflare proxy optional (DDoS protection)

## Initial Setup
1. SSH key setup
2. Docker + docker compose install
3. Clone repository
4. .env.production oluştur (template .env.example'dan)
5. Production secrets (DJANGO_SECRET_KEY, POSTGRES_PASSWORD, ANALYTICS_SALT)
   python -c "import secrets; print(secrets.token_urlsafe(50))"
6. Caddyfile DOMAIN değerini güncelle

## First Deploy
1. docker compose -f docker-compose.production.yml pull
2. docker compose -f docker-compose.production.yml up -d --build
3. docker compose exec backend python manage.py createsuperuser
4. docker compose exec backend python manage.py seed_demo
5. Caddy otomatik HTTPS (Let's Encrypt)

## Subsequent Deploys
```bash
cd /opt/agency-qr-menu
git pull origin main
docker compose -f docker-compose.production.yml up -d --build
docker compose exec backend python manage.py migrate
```

## Backup
- pg_dump cron (daily, 7-day retention)
- Hetzner Storage Box offsite sync

## Rollback
```bash
git checkout <previous-commit-sha>
docker compose -f docker-compose.production.yml up -d --build
```

## Monitoring
- Sentry dashboard (errors + performance)
- Better Stack uptime checks (5 min interval)
- Health endpoint: https://menu.example.com/health

## Troubleshooting
- DB connection issues
- Static files 404
- Caddy certificate renewal failures
- See docs/TROUBLESHOOTING.md
```

## V1 Dışı (YAPMA)

Online ödeme, sipariş, mutfak ekranı, garson çağırma, POS, rezervasyon, müşteri hesabı, sadakat, AI menü import, multi-tenant tenant switcher, cloud storage (S3/R2), Hetzner Storage Box kurulum (config yazılır, deploy Sprint 6 sonrası), domain registration.

## Commit Stili (~10-15 commit, Sprint 6 toplam)

- `feat(ops): production settings (ALLOWED_HOSTS, CORS, CSRF, SSL, cookies)`
- `feat(ops): Dockerfile prod target (gunicorn + collectstatic)`
- `feat(ops): docker-compose.production.yml + Caddyfile`
- `chore(docs): DEPLOYMENT.md (Hetzner + Caddy + rollback + monitoring)`
- `feat(ai): Modern Cafe logo AI generation (mcode-tools multimodal)`
- `feat(ai): Modern Cafe cover AI generation`
- `feat(frontend): OG image + favicon + meta tags`
- `feat(ops): Modern Cafe 5 QR seed (QRCode model)`
- `chore(docs): DEMO_SCRIPT.md (10 adım demo akışı)`
- `chore(docs): API_CONTRACT.md (tüm endpoint'ler)`
- `chore(docs): TROUBLESHOOTING.md (10+ common issues)`
- `chore(docs): V1_ACCEPTANCE.md (10 adım checklist)`
- `feat(ops): production smoke test script (scripts/smoke_test.sh)`
- `chore(docs): DECISIONS D-018 (production) + D-019 (monitoring)`

## V1 Demo Akışı (Uçtan Uca — Final)

V1 demo akışı artık tamamen hazır (Sprint 6 sonrası):

1. ✅ Hetzner VPS'te `menu.example.com` açılır, Caddy HTTPS sağlar
2. ✅ Modern Cafe kapak görseli + logo AI ile üretilmiş, marka kimliği tutarlı
3. ✅ QR kodu `menu.example.com/m/modern-cafe?qr=1` ile açılır
4. ✅ Mobil-first menü (TR default), kategori nav, item cards, drawer
5. ✅ LocaleSelector ile EN'e çevir, language_change event loglanır
6. ✅ Kategori gez, ürün detay drawer
7. ✅ WhatsApp/Phone CTA, click event loglanır
8. ✅ /admin/dashboard → audit events listesi
9. ✅ /admin/analytics → today/week/month views, breakdown, charts
10. ✅ Admin → items → fiyat değiştir → public'te yeni fiyat (30s altında)
11. ✅ Admin → items → active toggle → public'te gizlenir
12. ✅ Yeni QR oluştur → print → customer tarar → analytics'te scan_count artar

## Sprint 6 Kabul Kriterleri (Toplam)

✅ `docker compose -f docker-compose.production.yml config` valid
✅ Production settings DJANGO_DEBUG=0, ALLOWED_HOSTS configured, SSL aktif
✅ Caddyfile doğru route (frontend + backend)
✅ DEPLOYMENT.md çalıştırılabilir talimatlar (10+ section)
✅ Logo + kapak AI ile üretildi, modern-cafe-{logo,cover}.webp mevcut
✅ Public page meta tags (title, description, OG image)
✅ Modern Cafe 5+ QR seed oluşturuldu
✅ DEMO_SCRIPT.md 10 adım
✅ API_CONTRACT.md tüm endpoint'ler
✅ TROUBLESHOOTING.md 10+ common issue
✅ V1_ACCEPTANCE.md checklist
✅ scripts/smoke_test.sh exit 0
✅ Lighthouse mobile performance > 80
✅ Commit'ler main'e push
✅ DECISIONS D-018 + D-019

## Auth Expire Riski

Sprint 6 büyük sprint, 90 dakika kuralı uygulanır. Parçalar:
- 6A (45-60 dk): backend prod + deploy config + Caddyfile + DEPLOYMENT.md
- 6B (45-60 dk): demo polish + AI görsel + meta tags + QR seed
- 6C (30-45 dk): docs + smoke test + Lighthouse