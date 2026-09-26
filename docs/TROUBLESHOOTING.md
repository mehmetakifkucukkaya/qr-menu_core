# Troubleshooting Guide — QR Menü V1

**Tarih:** 2026-09-26
**Versiyon:** V1 (Sprint 6C)

Bu runbook QR Menü stack'inde (local dev + production + demo + testing) karşılaşılabilecek
yaygın hataları ve çözümlerini toplar. Production'a özel daha derin troubleshooting
[DEPLOYMENT.md §10](./DEPLOYMENT.md#10-troubleshooting)'da — burası tüm stack'i (local
dahil) kapsayan tek nokta.

Hata bulamadıysan: GitHub Issues'da arat, yoksa yeni issue aç ve bu dosyaya entry ekle.

---

## Local Development

### 1. "Cannot connect to Docker daemon"

**Symptom:**

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock.
Is the docker daemon running?
```

**Fix:**

- **macOS:** Docker Desktop açık değil. Applications → Docker Desktop → çalıştır. Whale
  ikonu menubar'da görünene kadar bekle. Reset gerekirse: Settings → Troubleshoot →
  Restart.
- **Linux:** `sudo systemctl start docker` veya `sudo service docker start`.
- **Verify:** `docker info` çıktı vermeli.

### 2. "Port 8000 / 3000 / 5432 already in use"

**Symptom:** `docker compose up` → `bind: address already in use` veya
"port is already allocated".

**Fix:**

```bash
# Kim kullanıyor?
lsof -ti:8000   # backend (Django)
lsof -ti:3000   # frontend (Next.js)
lsof -ti:5432   # postgres

# Boşalt (dikkat: PID'leri doğrula, yanlış process'i öldürme).
lsof -ti:8000 | xargs kill -9
lsof -ti:3000 | xargs kill -9

# Alternatif: başka bir compose çalışıyorsa onu durdur.
docker compose down
```

Port çakışması sıkça sebebi: başka bir proje aynı port'u kullanıyor veya eski
container exit olmuş ama port'u release etmemiş. İkinci durumda `docker ps -a` ile
gör, `docker rm <id>` ile sil.

### 3. "Database connection refused" / "could not translate host name"

**Symptom:**

```
django.db.utils.OperationalError: could not translate host name "postgres" to address
```

veya

```
psycopg2.OperationalError: connection to server at "localhost" (::1), port 5432 failed
```

**Fix:**

```bash
# 1. Postgres healthy mi?
docker compose ps postgres
# STATUS: Up (healthy) olmalı. (healthy) yoksa logs'a bak.

# 2. Logs
docker compose logs postgres --tail=50

# 3. Restart (nuclear, çoğu zaman çözer)
docker compose restart postgres
sleep 5
docker compose exec backend python manage.py check
```

`DATABASE_URL` env değerinde host `postgres` (docker service name) olmalı, `localhost`
DEĞİL. `config/settings/base.py` default'u `postgres` zaten — override etmediğinden emin ol.

### 4. "ALLOWED_HOSTS error"

**Symptom:**

```
django.core.exceptions.DisallowedHost: Invalid HTTP_HOST header: 'localhost:8000'.
```

veya production'da:

```
Bad Request (400)
```

**Fix:**

- **Local:** `.env`'de `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0` olmalı.
  `.env.example` zaten doğru ayarlı; kendi `.env`'ini oluştururken kopyala.
- **Production:** `.env.production`'da `DJANGO_ALLOWED_HOSTS=api.example.com,menu.example.com`
  (Caddy'nin proxy ettiği tüm host'lar). Wildcard (`*.example.com`) **kullanma** —
  Host header injection saldırısına açık.
- **Değiştikten sonra:** `docker compose restart backend` (settings modülü import
  time'da okunur).

### 5. "CSRF verification failed" / 403 Forbidden on POST

**Symptom:** Login veya admin POST → `403 Forbidden`,
console'da `CSRF verification failed. Request aborted.`

**Fix:**

```javascript
// Frontend fetch pattern (Next.js örneği)
const csrfRes = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
const { csrfToken } = await csrfRes.json();

fetch('/api/v1/admin/menus/', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRFToken': csrfToken,    // <-- kritik
  },
  body: JSON.stringify(payload),
});
```

**Backend tarafı kontrol:**

```bash
# Cookie set ediliyor mu?
curl -fsS -c /tmp/cookies.txt http://localhost:8000/api/v1/auth/csrf
cat /tmp/cookies.txt | grep csrftoken

# Cookie'deki token ile POST
TOKEN=$(awk '/csrftoken/ {print $7}' /tmp/cookies.txt)
curl -fsS -b /tmp/cookies.txt -c /tmp/cookies.txt \
  -H "X-CSRFToken: $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:8000/api/v1/auth/login \
  -d '{"email":"...","password":"..."}'
```

**CORS:** `CORS_ALLOWED_ORIGINS` frontend origin içermelidir (trailing slash YOK).
`https://menu.example.com` ✅, `https://menu.example.com/` ❌.

### 6. "Migrations not applied" / "relation does not exist"

**Symptom:**

```
django.db.utils.ProgrammingError: relation "menu_menu" does not exist
```

**Fix:**

```bash
# Manuel migrate
docker compose exec backend python manage.py migrate

# Container entrypoint otomatik migrate ediyor (base settings); restart yeterli olabilir
docker compose restart backend
```

**Verify:**

```bash
docker compose exec backend python manage.py showmigrations
# Her app altında [X] applied olmalı, [ ] boş olmamalı.
```

**Sık sebep:** Yeni model eklendi ama `python manage.py makemigrations` çalıştırılmadı.
Local'de:

```bash
docker compose exec backend python manage.py makemigrations
git add backend/apps/<app>/migrations/
git commit -m "feat(backend): <model> model + migration"
```

### 7. "Static files 404" (admin CSS yüklenmiyor)

**Symptom:** `/admin/` sayfası açılıyor ama CSS/JS yok — beyaz metin, broken layout.

**Fix:**

- **Local:** Next.js dev server `apps/web`'i serve eder; `/admin/*` reverse proxy ile
  backend'e gider. `apps/web/next.config.js`'teki `rewrites()`'i kontrol et. `npm run
  dev` ve `docker compose up backend` aynı anda çalışıyor olmalı.
- **Production:** `collectstatic` çalıştır:

  ```bash
  docker compose -f docker-compose.production.yml exec backend \
      python manage.py collectstatic --noinput
  ```

  Caddyfile'da `/static/*` reverse proxy `backend-static` volume'a işaret etmeli.

### 8. "Throttled — 429 Too Many Requests"

**Symptom:** Public menu veya events endpoint'i bir süre sonra `429` dönmeye başladı.

**Fix:**

- **Local test:** Throttle'i devre dışı bırakmak için `pytest` kullan (DRF test
  client throttle'i bypass eder). Manual test için 1 dakika bekle.
- **Production:** Cloudflare/Better Stack rate limiting ekle (zaten Better Stack
  uptime varsa oradan yapılabilir — V2).
- **Anon rate'i yükseltmek için** (`config/settings/base.py`):

  ```python
  REST_FRAMEWORK = {
      "DEFAULT_THROTTLE_RATES": {"anon": "120/min", "public_events": "60/min"},
  }
  ```

  Bu değişiklik bir karar gerektirir — Sprint notu aç.

### 9. "QR PNG download returns 403"

**Symptom:**

```bash
curl -b cookies.txt http://localhost:8000/api/v1/admin/qr-codes/17/download
# 403 Forbidden
```

**Fix:**

```bash
# 1. Session expired mi? Re-login.
curl -fsS -c cookies.txt -b cookies.txt http://localhost:8000/api/v1/auth/csrf
TOKEN=$(awk '/csrftoken/ {print $7}' cookies.txt)
curl -fsS -b cookies.txt -c cookies.txt \
  -H "X-CSRFToken: $TOKEN" -H "Content-Type: application/json" \
  -X POST http://localhost:8000/api/v1/auth/login \
  -d '{"email":"owner@...","password":"..."}'

# 2. Tenant mismatch — QR başka bir org'a mı ait?
# IsOrganizationMember permission engelliyor olabilir.
# Kontrol: response body'sine bak — 403 + DRF detail varsa permission deny.
curl -v -b cookies.txt http://localhost:8000/api/v1/admin/qr-codes/17/download 2>&1 | grep -i forbidden
```

### 10. "Analytics events not recording"

**Symptom:** Admin → Analitik dashboard boş (`today_views: 0`).

**Fix:**

```bash
# 1. Frontend POST atıyor mu? Network tab'da /api/v1/public/events 204 dönüyor mu?

# 2. Backend log'da error var mı?
docker compose logs backend --tail=100 | grep -i analytics

# 3. Silent ignore — organization_slug invalid
# Browser DevTools → Network → response body boş (204 normal). Ama organization_slug
# yanlışsa 204 döner, DB'ye yazılmaz. Frontend trackEvent payload'ını kontrol et.

# 4. DB'de ham query ile doğrula:
docker compose exec backend python manage.py shell -c "
from apps.analytics.models import MenuViewEvent
print('Toplam:', MenuViewEvent.objects.count())
print('Son 5:', list(MenuViewEvent.objects.order_by('-created_at').values('event_type','organization_id','created_at')[:5]))
"
```

### 11. "Seed demo idempotent değil — duplicate rows"

**Symptom:** `python manage.py seed_demo` ikinci kez çalıştırılınca duplicate category /
item row'ları oluşuyor.

**Fix:**

```bash
# 1. Önce neyin duplicate olduğunu bul:
docker compose exec backend python manage.py shell -c "
from apps.menu.models import MenuCategory
print('Kategori sayısı (group by menu+slug):')
from django.db.models import Count
for row in MenuCategory.objects.values('menu_id', 'slug').annotate(n=Count('id')).filter(n__gt=1):
    print(row)
"

# 2. Manuel temizlik (örnek — menu 12, slug 'kahve'):
docker compose exec backend python manage.py shell -c "
from apps.menu.models import MenuCategory
dups = MenuCategory.objects.filter(menu_id=12, slug='kahve').order_by('id')
keep = dups.first()
to_delete = dups.exclude(id=keep.id)
to_delete.delete()
"

# 3. seed_demo idempotent yapılmadıysa — bu bir bug; Sprint 6C scope-out,
# backlog'a ekle.
```

`seed_demo` V1'de **idempotent olması garanti** (Sprint 5A), ama translation row'ları
edge case'lerinde duplicate oluşabiliyor. Yukarıdaki cleanup güvenli — `id` en küçük
olanı tut, gerisini sil.

### 12. "Modern Cafe demo görseller yüklenmiyor"

**Symptom:** `/m/modern-cafe` sayfası açılıyor ama logo/kapak/image 404.

**Fix:**

```bash
# 1. Dosyalar mevcut mu?
ls -la apps/web/public/demo-assets/
# Beklenen: favicon.ico, og-image.png, modern-cafe-logo.png, modern-cafe-cover.png

# 2. Docker image'da yoksa (volume mount değilse) rebuild gerekli:
docker compose build frontend

# 3. Next.js public klasörü runtime'ta serve eder; restart yeterli olabilir:
docker compose restart frontend
```

### 13. "TypeScript build hatası (frontend)"

**Symptom:** `cd apps/web && npm run build` → TS2304, TS2531 vb.

**Fix:**

```bash
cd apps/web

# 1. Hangi dosya? Hangi satır?
npx tsc --noEmit

# 2. Tip regen (freezed):
cd .. && cd backend  # eğer backend types üretiyorsa
# Veya frontend kendi types'ı: genelde otomatik, ama bir edge case varsa:
cd ../apps/web && npm run gen-types  # script varsa

# 3. Node modules corruption:
rm -rf node_modules .next package-lock.json
npm install
npm run build
```

### 14. "Caddy: obtain certificate: no solvers available"

**Symptom:** Production → HTTPS 503, Caddy log:

```
acme: error: no solvers available
```

**Fix:**

```bash
# 1. DNS A record doğru mu? VPS IP'yi mi gösteriyor?
dig menu.example.com +short
# Çıktı VPS IP'si olmalı.

# 2. 80 port açık mı (Let's Encrypt HTTP-01 challenge için)?
curl -I http://menu.example.com
# Caddy'nin 200 dönmesi lazım (challenge server up olmalı).

# 3. Caddy reload (DNS düzelttikten sonra):
docker compose -f docker-compose.production.yml exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter json
```

Daha derin troubleshooting: [DEPLOYMENT.md §10.1](./DEPLOYMENT.md#101-caddy-obtain-certificate-no-solvers-available).

### 15. "Postgres out of disk"

**Symptom:**

```
ERROR: could not extend file "base/.../...": No space left on device
```

**Fix:**

```bash
# 1. Disk usage
df -h

# 2. En büyük docker artefact'leri
docker system df

# 3. Backup'ları temizle (cron'luysanız, retention > 7 gün olanları sil)
find /backups -mtime +7 -delete

# 4. Postgres WAL'leri (replication yoksa sıfırlanabilir)
docker compose exec postgres psql -U qr_menu -c "
SELECT pg_size_pretty(pg_database_size('qr_menu'));
"

# 5. Eski docker image'ları sil
docker image prune -a
```

VPS upgrade gerekebilir (Hetzner CX22 → CX32 disk büyütme).

### 16. "Sentry not receiving errors"

**Symptom:** Production 5xx → Sentry dashboard boş.

**Fix:**

```bash
# 1. SENTRY_DSN env doğru mu?
grep SENTRY_DSN .env.production

# 2. Container'da env görünüyor mu?
docker compose -f docker-compose.production.yml exec backend env | grep SENTRY

# 3. Backend log'da Sentry init mesajı var mı?
docker compose -f docker-compose.production.yml logs backend | grep -i sentry
# "Sentry init" veya "DSN set" mesajı görmeli.

# 4. Test error fırlat (production'da dikkat):
docker compose -f docker-compose.production.yml exec backend python -c "
import os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','config.settings.production')
import django; django.setup()
import sentry_sdk
sentry_sdk.capture_message('test from shell')
"
# Birkaç saniye sonra Sentry dashboard'da görünmeli.

# 5. Network: backend → sentry.io HTTPS çıkışı açık mı?
docker compose -f docker-compose.production.yml exec backend \
  curl -I https://sentry.io
```

### 17. "Audit events kaydedilmiyor"

**Symptom:** Admin dashboard → recent_events boş, ama action alındı.

**Fix:**

```bash
# 1. Son audit event'i DB'de sorgula:
docker compose exec backend python manage.py shell -c "
from apps.audit.models import AuditEvent
print(AuditEvent.objects.count(), 'audit events')
for e in AuditEvent.objects.order_by('-created_at')[:3]:
    print(e.created_at, e.actor, e.action, e.target_type)
"

# 2. signals.py yüklü mü? (apps/<app>/signals.py, apps.py ready()'da connect)
docker compose exec backend python manage.py shell -c "
import apps.menu.signals  # force import
from django.db.models.signals import post_save
print('connected:', post_save.receivers)
"

# 3. Atomic transaction içinde hata — exception rollback audit'i de siler.
# Eğer audit log 0 ise ve atomic transaction içinde bir update yaptıysan, audit de
# rollback olmuş olabilir. Bu V1 bilinen bir trade-off (D-016).
```

### 18. "Frontend build çok yavaş / OOM"

**Symptom:** `npm run build` dakikalarca sürüyor veya `JavaScript heap out of memory`.

**Fix:**

```bash
cd apps/web

# Node memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Veya .env.local'e ekle:
echo 'NODE_OPTIONS="--max-old-space-size=4096"' >> .env.local
```

### 19. "docker-compose up çok uzun sürüyor"

**Symptom:** İlk `up` 10+ dakika.

**Beklenen:** İlk build (Docker image layer'ları cache'lenmedi) + npm install + Django
collectstatic. Normal. İkinci `up` 5-10 saniye.

**Fix (cache invalidation):**

```bash
# Layer cache bozulduysa (örn. requirements.txt değişti):
docker compose build --no-cache backend
```

### 20. "Yardım — issue bulamadım"

**Fix:**

1. Bu dosyayı aradıysan ve bulamadıysan → GitHub Issues'da yeni issue aç, label:
   `bug`, `troubleshooting`.
2. PR ile birlikte bu dosyaya yeni entry ekle — aynı hatayı başkası da yaşayabilir.
3. Production acil durum: [DEPLOYMENT.md §8 Monitoring](./DEPLOYMENT.md#8-monitoring)
   + Better Stack alert route'u.
