# Production Deployment

This document walks through taking **qr-menu_core** from a fresh Hetzner VPS
to a fully running, HTTPS-served demo instance. The automation here is
intentionally minimal: a single `docker compose` stack managed by `git pull`
on the server, with Caddy as the only public entry point.

> **D-004** — Deploy target = Hetzner VPS + Cloudflare DNS + Caddy.
> **D-007** — Python 3.12-slim, Node 20-bookworm-slim, Postgres 16-alpine.
> **D-018** — Production settings pattern (env-driven, Caddy-proxied,
> Sentry optional). See [DECISIONS.md](../DECISIONS.md#karar-d-018).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initial Setup](#2-initial-setup)
3. [First Deploy](#3-first-deploy)
4. [Subsequent Deploys](#4-subsequent-deploys)
5. [Backup Strategy](#5-backup-strategy)
6. [Rollback Procedure](#6-rollback-procedure)
7. [Monitoring](#7-monitoring)
8. [Performance Tuning](#8-performance-tuning)
9. [Security Checklist](#9-security-checklist)
10. [Troubleshooting](#10-troubleshooting)
11. [Appendix A — Useful commands](#appendix-a--useful-commands)
12. [Appendix B — File reference](#appendix-b--file-reference)

---

## 1. Prerequisites

Before you touch the VPS, make sure the following are in place.

### 1.1 VPS — Hetzner CX22 (NBG1)

- 4 GB RAM, 2 vCPU, 40 GB NVMe SSD — enough headroom for the stack plus
  Postgres and a future 2nd tenant.
- Ubuntu 24.04 LTS (server install, no GUI).
- SSH key-based root access enabled; **disable password SSH** before going live.
- Snapshot enabled in Hetzner console (cheap insurance — rollback the whole
  VPS in 60 s).

### 1.2 Domain

You need a domain whose DNS you control (Cloudflare is the recommended
provider because of free DDoS protection + proxy mode).

| Type | Name | Value |
|---|---|---|
| `A` | `menu.example.com` | `<VPS public IP>` |
| `A` | `app.example.com` (optional, frontend admin) | `<VPS public IP>` |

DNS records should point at Caddy (i.e. the VPS IP) **without** the
Cloudflare orange cloud proxy enabled for the initial certificate
provisioning — once Caddy has issued the cert you can flip Cloudflare to
"Full (Strict)" mode and the orange cloud on.

### 1.3 Local tooling (your laptop)

- `ssh` (built-in)
- `rsync` (built-in) — for offsite backups if you don't want Hetzner
  Storage Box
- `psql` client (optional, for poking the DB)

### 1.4 Secrets to generate up front

Run these on your laptop and store the output in a password manager
(1Password / Bitwarden). The `.env.production` template references these
values — paste them in step 2.5.

```bash
# Django secret (50+ chars, urlsafe base64)
python -c "import secrets; print('DJANGO_SECRET_KEY=' + secrets.token_urlsafe(50))"

# Analytics salt (32+ chars; must stay stable for the lifetime of the
# deployment because IP/UA hashes are derived from it)
python -c "import secrets; print('ANALYTICS_SALT=' + secrets.token_urlsafe(32))"

# Postgres password (24+ chars; rotate quarterly)
python -c "import secrets; print(secrets.token_urlsafe(24))"
```

> **Never commit these.** `.env.production` is in `.gitignore` (the
> catch-all `.env*` rule covers it).

---

## 2. Initial Setup

### 2.1 SSH hardening

```bash
ssh root@<VPS_IP>
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Disable root SSH + password auth
sudo sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

### 2.2 Firewall (ufw)

```bash
sudo apt update && sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
sudo ufw status
```

### 2.3 Install Docker + Compose plugin

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
   https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow the deploy user to run docker without sudo
sudo usermod -aG docker deploy
# Log out + log back in for the group change to take effect.
```

Verify:

```bash
docker --version
docker compose version
```

### 2.4 Clone the repository

```bash
sudo mkdir -p /opt/agency-qr-menu
sudo chown deploy:deploy /opt/agency-qr-menu
cd /opt/agency-qr-menu
git clone https://github.com/mehmetakifkucukkaya/qr-menu_core.git .
git log --oneline -1  # confirm you pulled the right commit
```

### 2.5 Create `.env.production`

Copy the template and fill in the secrets from step 1.4:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
$EDITOR .env.production
```

Required edits:

| Var | Example | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | 50+ char token | from step 1.4 |
| `POSTGRES_PASSWORD` | 24+ char token | from step 1.4 |
| `DATABASE_URL` | `postgres://qr_menu:...@postgres:5432/qr_menu` | use the same password as `POSTGRES_PASSWORD` |
| `ANALYTICS_SALT` | 32+ char token | from step 1.4 |
| `DJANGO_ALLOWED_HOSTS` | `menu.example.com` | match `DOMAIN` |
| `CORS_ALLOWED_ORIGINS` | `https://menu.example.com` | must be https in prod |
| `NEXT_PUBLIC_API_BASE_URL` | `https://menu.example.com` | same domain — Caddy routes `/api/*` to backend |
| `INTERNAL_API_BASE_URL` | `http://backend:8000` | docker network name, not localhost |
| `INTERNAL_API_TOKEN` | 32+ char token | shared by the Next.js server and the backend; without it every visitor shares one rate-limit bucket |
| `PUBLIC_BASE_URL` | `https://menu.example.com` | printed into every QR code; the backend refuses to start if missing or `localhost` |
| `PAYMENT_FERNET_KEY` | 44-char Fernet key | required even with payments off (see `.env.production.example` for how to generate) |
| `DOMAIN` | `menu.example.com` | matches the DNS A record |
| `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL` | your SMTP provider | customer magic-link login e-mails; failures are logged by the backend |

> **Always pass `--env-file .env.production`** to `docker compose` (every command
> below does). Compose reads `.env`, not `.env.production`, for the `${VAR}`
> values used as build args, so without the flag the frontend bundle was built
> pointing at `http://localhost:8000`.

Run the validation script to catch typos before the first deploy:

```bash
bash scripts/validate_prod_env.sh
```

Expected output:

```
✅ All required variables present
```

### 2.6 Confirm DNS

From your laptop:

```bash
dig menu.example.com +short
# should resolve to <VPS_IP>
```

If it doesn't resolve yet, **wait** — Caddy will fail certificate issuance
otherwise and the stack won't come up.

---

## 3. First Deploy

```bash
cd /opt/agency-qr-menu

# Build + start everything in the background.
docker compose --env-file .env.production -f docker-compose.production.yml pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# Watch the logs (Ctrl-C exits; the stack keeps running).
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=200
```

What you should see, in order:

1. `postgres` — `database system is ready to accept connections`
2. `backend` — `Running migrations: … Applying … OK`
3. `backend` — `collectstatic … 0 static files copied` (or more if any)
4. `backend` — `Booting worker with pid: …`
5. `frontend` — `▲ Next.js …`
6. `caddy` — `obtained certificate` + `serving HTTPS on :443`

### 3.1 Create the first admin

(The Django admin site is at `https://menu.example.com/django-admin/`; the
operator panel your customers' staff use is `https://menu.example.com/admin/`.
Plan changes for a tenant are made in the Django admin: tenants cannot change
their own plan.)

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py createsuperuser
```

### 3.2 Seed demo data

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py seed_demo
```

### 3.3 Smoke test

```bash
# Health check (must return 200 + JSON).
curl -fsS https://menu.example.com/health | jq

# Public menu page (HTML, no auth).
curl -fsS https://menu.example.com/m/modern-cafe | head -30
```

If `curl` returns `SSL certificate problem`, the most common cause is
DNS not having propagated yet — see [§10 Troubleshooting](#10-troubleshooting).

---

## 4. Subsequent Deploys

The cadence is: pull, rebuild, restart. Migrations run automatically as
part of the backend `CMD`.

```bash
cd /opt/agency-qr-menu

# 1. Pull the new commits.
git pull origin main

# 2. Rebuild + restart. The ``--build`` flag rebuilds images whose context
#    changed; unchanged images are reused. ``-d`` runs in the background.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build

# 3. Watch logs for ~30 s to catch boot errors.
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=100
```

> **Migrations are run on every container start** (the backend `CMD`
> chains `migrate --noinput` before gunicorn). If you ever want to run
> migrations manually — e.g. for a one-off backfill — invoke the
> `migrate` command in the running container:
>
> ```bash
> docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
>     python manage.py migrate
> ```

### 4.1 Zero-downtime deploys (V2)

V1 redeploys cause a ~5 s blip while the new backend container starts.
V2 will introduce a rolling restart pattern (start the new container,
wait for `/health` to return 200, then `docker compose stop` the old one).
Until then, schedule deploys during low-traffic windows.

---

## 5. Backup Strategy

### 5.1 Postgres — daily logical backup

Create `/opt/agency-qr-menu/scripts/backup.sh` (this repo's
`scripts/backup.sh` template, when added, will mirror the same shape):

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/agency-qr-menu

BACKUP_DIR="/var/backups/qr-menu"
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean \
    > "$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql"

# Retention — drop anything older than $RETENTION_DAYS days.
find "$BACKUP_DIR" -name "db-*.sql" -mtime +$RETENTION_DAYS -delete

echo "Backup complete: $BACKUP_DIR"
```

Make it executable and schedule it via cron:

```bash
chmod +x /opt/agency-qr-menu/scripts/backup.sh

# Run daily at 03:17 Istanbul time (DB quiet hours).
echo "17 3 * * * /opt/agency-qr-menu/scripts/backup.sh >> /var/log/qr-menu-backup.log 2>&1" \
    | sudo crontab -
```

### 5.2 Offsite copy — Hetzner Storage Box

If you have a Hetzner Storage Box (or any rsync-able remote):

```bash
# Add to backup.sh, after the local dump:
rsync -az "$BACKUP_DIR/db-latest.sql" \
    uXXXXX@uXXXXX.your-storagebox.de:/backups/qr-menu/
```

The free-tier Box plan is fine for V1 volumes (a single daily dump is
~1 MB for a demo tenant).

### 5.3 Restore drill

```bash
# Drop the running DB and re-import from a backup.
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
    psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $POSTGRES_DB;"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
    createdb -U "$POSTGRES_USER" "$POSTGRES_DB"
docker compose --env-file .env.production -f docker-compose.production.yml exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    < /var/backups/qr-menu/db-20260926-031700.sql

# Restart backend so it picks up the restored DB.
docker compose --env-file .env.production -f docker-compose.production.yml restart backend
```

Schedule a restore drill **quarterly** — a backup you haven't tested
isn't a backup.

---

## 6. Rollback Procedure

When a deploy goes wrong (failed migration, broken frontend, etc.) you
have two rollback axes.

### 6.1 Code rollback (cheap, do this first)

```bash
cd /opt/agency-qr-menu

# 1. Find the last good commit.
git log --oneline -20

# 2. Check it out (this updates the working tree only; main branch tip
#    is untouched, so a later ``git pull`` will fast-forward again).
git checkout <last-good-sha>

# 3. Rebuild + restart.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

The backend's `CMD` runs `migrate` on every start. If the previous
migration was already applied to the live DB, Django will detect "no
migrations to apply" and move on; if the previous migration is **ahead**
of the new code's expectations, you may need to roll back the migration
manually:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py migrate <app> <previous_migration_name>
```

### 6.2 Database rollback (expensive, last resort)

Only needed if a migration corrupted data or if you rolled code back
past a destructive migration. Use the [backup from §5.3](#53-restore-drill).

### 6.3 Hetzner snapshot (nuclear option)

If everything is on fire, restore the whole VPS from a Hetzner snapshot:

1. Hetzner Cloud Console → Servers → your VPS → Snapshots.
2. Click the snapshot → "Restore snapshot".
3. SSH back in and run `docker compose up -d` (images + volumes are
   preserved in the snapshot).

---

## 7. Monitoring

### 7.1 Health endpoint

`GET /health` returns 200 + JSON `{status: "ok", database: "ok", version: "..."}` (503 when the database is unreachable)
when the API is fully up. Caddy routes this directly to the backend.

Wire any uptime monitor (Better Stack, UptimeRobot, Healthchecks.io) to
`https://menu.example.com/health` with a 5-minute interval. Alert on any
non-200 or on response time > 2 s.

### 7.2 Sentry (optional)

Create a Sentry project, copy the DSN, and set:

```bash
SENTRY_DSN=https://...@sentry.io/12345
SENTRY_ENVIRONMENT=production
```

The backend SDK initialises only when `SENTRY_DSN` is non-empty
(see `config/settings/production.py`). 10 % of requests are sampled
for performance traces; 100 % of errors are reported.

### 7.3 Container logs

```bash
# Live tail, all services.
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=200

# Just the backend.
docker compose --env-file .env.production -f docker-compose.production.yml logs -f backend
```

JSON log lines (when `json-logging` is installed) are shippable as-is
to Better Stack / Loki / Datadog.

### 7.4 Disk + memory

Hetzner CX22 has 4 GB RAM. The stack at idle uses ~1.2 GB (Postgres 400 MB,
backend 350 MB × 1 worker, frontend 200 MB, caddy 50 MB). Two gunicorn
workers (the default `--workers 3` from the Dockerfile) bring that to
~1.6 GB — comfortable headroom.

Set up a Hetzner Cloud Monitoring alert for **disk > 85 %** and **RAM
> 90 %** so you catch runaway log volumes before they take the stack
down.

---

## 8. Performance Tuning

V1 doesn't need much tuning, but a few defaults are worth knowing.

### 8.1 Gunicorn workers

`--workers 3` is hard-coded in the backend Dockerfile. Rule of thumb:
`2 × CPU cores + 1`. CX22 has 2 vCPU, so 3 is the sweet spot. If you
move to a CX32 (4 vCPU) bump to 5.

### 8.2 Postgres connection pool

`DATABASES["default"]["CONN_MAX_AGE"]` is set to 600 s (10 min). With 3
workers, peak open connections are ~3-4 — well under Postgres' default
100-connection limit.

### 8.3 Next.js standalone

The frontend image uses Next.js `standalone` output
(`apps/web/next.config.mjs`), which ships only the dependencies the app
actually needs (~250 MB vs ~400 MB for the full `node_modules`). No
action required — this is the default.

### 8.4 CDN (optional, V2)

For real customer traffic, put Cloudflare in front of the domain and
enable "Full (Strict)" SSL mode. The Caddy origin cert stays the same;
Cloudflare edges cache `/static/*` and the public menu HTML.

---

## 9. Security Checklist

Run through this before the first deploy and after every major change.

- [ ] SSH password auth disabled (`PasswordAuthentication no`)
- [ ] Root SSH disabled (`PermitRootLogin no`)
- [ ] UFW active: only 22, 80, 443 open
- [ ] Hetzner Cloud Firewall rules allow 80/443 only
- [ ] `.env.production` is `chmod 600` and owned by `deploy`
- [ ] `DJANGO_SECRET_KEY` is ≥ 50 chars and unique per environment
- [ ] `ANALYTICS_SALT` is ≥ 32 chars and unique per environment
- [ ] `POSTGRES_PASSWORD` is ≥ 24 chars
- [ ] `DJANGO_DEBUG=0` (default, do not enable in prod)
- [ ] `DJANGO_ALLOWED_HOSTS` lists **only** the prod domain(s)
- [ ] `CORS_ALLOWED_ORIGINS` lists **only** the prod https origin(s)
- [ ] `SENTRY_DSN` is set (or you explicitly opted out of Sentry)
- [ ] HSTS preload list — submit `menu.example.com` once traffic stabilises
- [ ] Hetzner snapshot taken before the first deploy
- [ ] Backup cron installed + verified with a restore drill

---

## 10. Troubleshooting

### 10.1 "Caddy: obtain certificate: no solvers available"

**Cause:** DNS records don't point at the VPS yet, or Let's Encrypt
rate-limited the domain.

**Fix:**

```bash
# Verify DNS from the VPS itself.
dig menu.example.com +short

# If correct but Caddy still fails, check the Caddy log.
docker compose --env-file .env.production -f docker-compose.production.yml logs caddy | tail -50

# Workaround for the rate limit: comment out ``tls {$EMAIL}`` and let
# Caddy serve HTTP-only until the rate limit resets (1 hour). Then
# re-enable.
```

### 10.2 "502 Bad Gateway" from Caddy

**Cause:** The backend or frontend container isn't healthy.

**Fix:**

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs backend --tail=100

# Common culprits:
# - Postgres not ready → backend migration failed → check postgres logs
# - Bad secret key → check `docker compose logs backend | grep -i secret`
# - collectstatic failed on a file with weird permissions
```

### 10.3 Static files 404

**Cause:** `collectstatic` didn't run, or the `backend-static` volume
is empty.

**Fix:**

```bash
# Re-run collectstatic (idempotent).
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py collectstatic --noinput

# Verify the volume has files.
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    ls /app/staticfiles | head
```

### 10.4 Database connection errors in backend logs

```
django.db.utils.OperationalError: could not translate host name "postgres" to address
```

**Cause:** Backend container started before Postgres' healthcheck passed,
or `DATABASE_URL` has the wrong host.

**Fix:**

```bash
# Confirm `DATABASE_URL` uses the docker service name, NOT localhost.
grep DATABASE_URL .env.production
# Should be: postgres://qr_menu:...@postgres:5432/qr_menu

# Confirm Postgres is up.
docker compose --env-file .env.production -f docker-compose.production.yml ps postgres
docker compose --env-file .env.production -f docker-compose.production.yml logs postgres --tail=50
```

### 10.5 Missing environment variable at startup

```
RuntimeError: DJANGO_SECRET_KEY must be set to a strong random value in production.
```

**Cause:** Either `DJANGO_SECRET_KEY` is empty, or it's still the
placeholder from `base.py`.

**Fix:** Re-run the generator from [§1.4](#14-secrets-to-generate-up-front)
and update `.env.production`. Then:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate backend
```

### 10.6 Frontend can't reach the API

**Symptom:** Browser console shows `CORS error` or `Failed to fetch`.

**Fix:**

1. `CORS_ALLOWED_ORIGINS` must include the **exact** frontend origin
   (scheme + host + port if non-standard). E.g. `https://menu.example.com`,
   not `https://menu.example.com/`.
2. `NEXT_PUBLIC_API_BASE_URL` must be the **public** URL (what the browser
   sees), not `http://backend:8000`.
3. After editing `.env.production`, restart the affected services:

   ```bash
   docker compose --env-file .env.production -f docker-compose.production.yml restart frontend backend
   ```

### 10.7 Out of disk

**Symptom:** Containers fail with `no space left on device`.

**Fix:**

```bash
# Find the largest docker artefacts.
docker system df

# Reclaim space (safe — only stops unused containers/images).
docker system prune -a

# If logs are the problem:
journalctl --vacuum-size=200M
```

### 10.8 AuditEvent / analytics missing

If admin summary or `/api/v1/admin/analytics/overview` returns empty
results, the `seed_demo` command may not have run. Re-run it:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py seed_demo
```

This creates the Modern Cafe business + 5 categories + 25 items + 5 QR
codes (Sprint 6B will add 5 more for the full demo flow).

---

## Appendix A — Useful commands

```bash
# Open a Django shell on the running backend.
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py shell

# Tail logs for a single service with timestamps.
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=50 -t backend

# Run pytest in the live container (uses sqlite, won't touch prod DB).
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    pytest -v

# Connect to Postgres directly.
docker compose --env-file .env.production -f docker-compose.production.yml exec postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Force a fresh build (e.g. after requirements.txt change).
docker compose --env-file .env.production -f docker-compose.production.yml build --no-cache backend
docker compose --env-file .env.production -f docker-compose.production.yml up -d backend

# Roll back to the previous git commit.
git checkout HEAD~1 && docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

---

## Appendix B — File reference

| Path | Purpose |
|---|---|
| `backend/Dockerfile` | Multi-stage: base / dev / prod (D-018) |
| `backend/config/settings/production.py` | Production settings — DJANGO_DEBUG=0, SSL, cookies, JSON logs, optional Sentry (D-018) |
| `docker-compose.production.yml` | 4-service prod stack: postgres + backend + frontend + caddy |
| `Caddyfile` | HTTPS + reverse-proxy + security headers |
| `.env.production.example` | Template for the env file (never commit the real `.env.production`) |
| `scripts/validate_prod_env.sh` | Pre-deploy sanity check for `.env.production` |
| `docs/TROUBLESHOOTING.md` | Per-issue fixes (Sprint 6C) |
| `docs/API_CONTRACT.md` | Full backend API reference (Sprint 6C) |
| `DECISIONS.md` | D-018 production settings rationale |
