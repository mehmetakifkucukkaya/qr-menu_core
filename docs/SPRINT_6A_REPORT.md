# Sprint 6A — Production Backend + Deploy Config — Rapor

**Tarih:** 2026-09-26
**Sprint:** 6A (Sprint 6'nın 1/3'ü)
**Durum:** ✅ Tamamlandı, main'e push edildi
**Önceki:** Sprint 5B-2 (analytics dashboard frontend) → 92 commit, 121 test
**Sonraki:** Sprint 6B (demo polish + AI görsel)

## Özet

V1 demo akışı artık production'a deploy edilebilecek tüm altyapıya sahip:
production settings (env-driven, runtime safety rails), multi-stage Dockerfile
prod target, 4-servisli docker-compose.production.yml, Caddy HTTPS reverse
proxy, kapsamlı DEPLOYMENT.md runbook, env validation scripti ve yeni test
suite'ı. Gerçek deploy Hetzner VPS olmadığı için ertelendi (V1 sonrası) —
sprint sadece config + docs hazırladı.

## Kabul Kriterleri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `production.py` DJANGO_DEBUG=0 default | ✅ | `_env_bool("DJANGO_DEBUG", "0") == "1"` guard |
| 2 | ALLOWED_HOSTS env-driven | ✅ | RuntimeError on empty |
| 3 | CORS_ALLOWED_ORIGINS env-driven | ✅ | RuntimeError on empty |
| 4 | CSRF_TRUSTED_ORIGINS = CORS mirror | ✅ | production.py:66 |
| 5 | SECURE_SSL_REDIRECT + HSTS + cookies secure | ✅ | All True, 1-year HSTS preload |
| 6 | Sentry SDK optional init | ✅ | `if SENTRY_DSN:` guard, send_default_pii=False |
| 7 | JSON logging to stdout | ✅ | json-logging + simple fallback |
| 8 | Multi-stage Dockerfile prod target | ✅ | base/dev/prod, gunicorn + collectstatic + migrate |
| 9 | docker-compose.production.yml 4 services | ✅ | postgres + backend + frontend + caddy |
| 10 | Caddyfile HTTPS + routing + security headers | ✅ | HSTS, X-Content-Type-Options, X-Frame-Options DENY |
| 11 | .env.production.example template | ✅ | Inline `secrets.token_urlsafe(N)` commands |
| 12 | scripts/validate_prod_env.sh exit 0 valid env | ✅ | Tested with both valid + invalid env |
| 13 | DEPLOYMENT.md 12 sections | ✅ | 705-line runbook |
| 14 | DECISIONS D-018 added | ✅ | D-018 entry + Karar Geçmişi tablosu |
| 15 | pytest yeşil (134 passed, 1 skipped) | ✅ | 14 new tests (production settings safety) |
| 16 | Commits main'e push | ✅ | 6 commits → github.com/mehmetakifkucukkaya/qr-menu_core |

## Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar (8)

| Path | Bytes | Purpose |
|---|---|---|
| `backend/config/settings/production.py` | 9345 | D-018 production settings (overwritten minimal v0) |
| `backend/tests/test_production_settings.py` | 8622 | 14 safety-rail tests |
| `docker-compose.production.yml` | 4054 | 4-service prod stack |
| `Caddyfile` | 3073 | HTTPS + reverse proxy + security headers |
| `.env.production.example` | 4369 | Env template with secret-gen commands |
| `scripts/validate_prod_env.sh` | 4280 | Pre-deploy env validation |
| `docs/DEPLOYMENT.md` | 21553 | 12-section deploy runbook |
| (DECISIONS.md D-018 entry) | ~3.4 KB | Karar entry appended |

### Değiştirilen dosyalar (4)

| Path | Change |
|---|---|
| `backend/Dockerfile` | Multi-stage (base/dev/prod), prod target with migrate + collectstatic + gunicorn |
| `backend/requirements.txt` | `+ sentry-sdk[django]==2.19.2` |
| `backend/requirements-dev.txt` | `+ json-logging==1.4.1` |
| `DECISIONS.md` | D-017 + D-018 to Karar Geçmişi; D-018 full entry appended |

### Untracked (pre-existing, not part of this sprint)

- `backend/config/staticfiles/` — runtime artifact from earlier `collectstatic`
- `backend/test_real.jpg` — pre-existing test fixture

## Doğrulama Komut Çıktıları

### 1. pytest (full suite)

```bash
$ cd backend && DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest --tb=no -q
...
134 passed, 1 skipped, 1 warning in 1.91s
```

- **134 passed** (120 baseline + 14 new production settings tests)
- **1 skipped**: DRF throttle cache pattern (Sprint 4A, intentional)

### 2. Production settings import (valid env)

```bash
$ env -i DJANGO_DEBUG=0 DJANGO_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')" \
    DJANGO_ALLOWED_HOSTS=menu.example.com \
    CORS_ALLOWED_ORIGINS=https://menu.example.com \
    DATABASE_URL=postgres://qr_menu:test@postgres:5432/qr_menu \
    ANALYTICS_SALT="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" \
    python3 -c "import django; django.setup(); from django.conf import settings; \
        print('DEBUG:', settings.DEBUG); print('SECURE_SSL_REDIRECT:', settings.SECURE_SSL_REDIRECT); \
        print('console formatter:', settings.LOGGING['handlers']['console']['formatter'])"

DEBUG: False
SECURE_SSL_REDIRECT: True
console formatter: json
```

### 3. Production settings refuse to start with missing env (subprocess test)

```bash
$ python -m pytest tests/test_production_settings.py -v
...
test_production_settings_raise_when_env_missing[DJANGO_SECRET_KEY] PASSED
test_production_settings_raise_when_env_missing[DJANGO_ALLOWED_HOSTS] PASSED
test_production_settings_raise_when_env_missing[CORS_ALLOWED_ORIGINS] PASSED
test_production_settings_import_with_valid_env PASSED
======================== 14 passed, 1 warning in 0.75s =========================
```

### 4. docker compose config validation

```bash
$ docker compose -f docker-compose.production.yml config --quiet
time="..." level=warning msg="The \"INTERNAL_API_BASE_URL\" variable is not set. Defaulting to a blank string."
exit=0
```

Exit 0 (warning is expected because no `.env.production` exists). All 4
services render with `restart: unless-stopped`.

### 5. validate_prod_env.sh

Valid env:
```bash
$ bash scripts/validate_prod_env.sh
🔍 Checking required variables in .env.production …
  ✅ DJANGO_SECRET_KEY
  ✅ DJANGO_ALLOWED_HOSTS
  ... (11/11 pass)
✅ All required variables present and strong.
exit=0
```

Invalid env (placeholder):
```bash
$ cp .env.production.example .env.production && bash scripts/validate_prod_env.sh
❌ DJANGO_SECRET_KEY (placeholder value — replace)
❌ POSTGRES_PASSWORD (placeholder value — replace)
❌ ANALYTICS_SALT (placeholder value — replace)
exit=1
```

## Commit Listesi

```
be34606 chore(docs): DECISIONS D-018 (production settings pattern)
8c0c21a chore(docs): DEPLOYMENT.md (Hetzner + Caddy + rollback + monitoring + troubleshooting)
9a92712 chore(ops): .env.production.example + validate_prod_env.sh
62c69f5 chore(ops): docker-compose.production.yml + Caddyfile
b472867 chore(backend): Dockerfile prod target + requirements (gunicorn + sentry + json-logging)
c25b085 feat(backend): production settings (ALLOWED_HOSTS, CORS, CSRF, SSL, cookies, JSON logging, optional Sentry)
```

Toplam: **6 commit** (plan'da 5-7 commit öngörülmüştü, hedefin içinde).
Tüm commit'ler main branch'e push edildi.

## Production Deploy Akışı (Manuel — VPS Yok)

Hetzner VPS şu an yok, gerçek deploy V1 demo'su sonrasına ertelendi. Bu sprint
config + docs hazırladı. Deploy sırası (DEPLOYMENT.md'den):

1. **Hetzner CX22** (NBG1, Ubuntu 24.04) → SSH key, ufw, Docker install
2. **Domain DNS** → A record menu.example.com → VPS IP
3. **Clone repo** → `/opt/agency-qr-menu`
4. **`cp .env.production.example .env.production`** + secrets generate
5. **`bash scripts/validate_prod_env.sh`** → exit 0
6. **`docker compose -f docker-compose.production.yml up -d --build`**
7. **`createsuperuser` + `seed_demo`** → exec into backend container
8. **Caddy auto HTTPS** → Let's Encrypt cert provisioned
9. **`curl https://menu.example.com/health`** → 200 + JSON

Backup (cron, daily pg_dump) + monitoring (Sentry DSN) + rollback (git
checkout) prosedürleri DEPLOYMENT.md §5-7'de.

## Sprint 6B Hazırlık Notu

Sprint 6B kapsamı (sıradaki worker):

- **Modern Cafe logo + cover** — AI ile mcode-tools multimodal kullanılarak üretilecek (`mcode-tools connector tools --keyword image`)
- **WebP optimizasyon** — `apps/web/public/demo-assets/` altına kaydedilecek
- **Meta tags** — public page'de title, description, OG image, twitter card
- **Favicon + viewport** — `apps/web/src/app/layout.tsx`
- **QR seed** — Modern Cafe için en az 5 QR (Kasa + Masa 1-4)
- **DEMO_SCRIPT.md** — 10 adımlık demo akışı

6B başlamadan önce: mcode-tools'un auth'lu ve hazır olduğundan emin ol
(Sprint 6 plan notu: "mcode-tools multimodal gerekli, hazır ve auth'lu").
AI görsel üretimi için prompt template'i `docs/DEMO_IMAGES.md`'de var —
6B oradan başlayabilir.

## Sprint 6A Notlar / Lessons Learned

- **Subprocess test path bug** — `Path(__file__).resolve().parents[1]` yerine `parents[2]` kullanmak gerekiyordu (test dosyası `config/settings/` altında olduğu için). Düzeltildi, test artık `backend/tests/` altında.
- **HSTS preload cookie same-site** — Cookie `Secure` flag'i Caddy TLS termination varsa güvenli; local dev'de `CSRF_COOKIE_SECURE=False` kalmalı (CSRF test'leri local'de çalışıyor).
- **Dockerfile multi-stage** — `prod` target'ı migrate + collectstatic + gunicorn tek CMD'de; bu V1'de restart süresini 5 saniyeye düşürüyor. V2'de init container + healthcheck gate ile rolling restart yapılabilir.
- **Sentry opt-in** — DSN env yoksa SDK import olmaz bile. Bu sayede demo deploy'lar Sentry account gerektirmeden çalışır; gerçek tenant için sadece 2 env satırı eklemek yeterli.
- **Production safety rails (RuntimeError)** — Bir kez bile "placeholder secret ile prod deploy ettik" skandalı yaşamamak için startup-time fail. Tests `config.settings.test` modülünü kullanır (production.py import etmez), 14 yeni structural test production.py'nin korunmasını sağlar.

## Sprint 6A Tamamlanma Süresi

Yaklaşık 50 dakika (plan öngörüsü 45-60 dk, hedefin içinde).
