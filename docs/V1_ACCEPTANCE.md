# V1 Demo Acceptance Checklist

**Tarih:** 2026-09-26
**Versiyon:** V1 (Sprint 6C)
**Kaynak:** [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)

Bu belge QR Menü V1 demo akışının 10 adımının geçtiğini kanıtlamak için kullanılır.
Her adım için **kanıt** alanı doldurulmalı (screenshot path, curl çıktısı, DB query).

> **Kullanım:** Demo günü bu checklist'i aç, her adımı işaretle. İşaretlenemeyen adım
> varsa → V1 demo-ready değil, blocking issue olarak kayda al.

---

## Pre-Demo

Servisler ayağa kalkmadan önce:

- [ ] **Tüm servis healthy:** `docker compose ps` → 3/3 (postgres, backend, frontend)
  ```
  NAME      STATUS
  postgres  Up (healthy)
  backend   Up (healthy)
  frontend  Up (healthy)
  ```
- [ ] **Backend test:** `docker compose exec backend pytest -q` → **134 passed**
- [ ] **Frontend build:** `cd apps/web && npm run build` → temiz (exit 0)
- [ ] **TypeScript:** `cd apps/web && npx tsc --noEmit` → temiz
- [ ] **seed_demo idempotent:** 2. çalıştırma 0 created/updated:
  ```bash
  docker compose exec backend python manage.py seed_demo
  # Çıktı: "Demo data seed tamamlandı. Created: 0, Updated: 0"
  ```
- [ ] **Modern Cafe görselleri:** `ls apps/web/public/demo-assets/` →
  `modern-cafe-logo.webp, modern-cafe-cover.webp, og-image.jpg` (Sprint 6B AI generate)
  - Bonus: `og-image.png` + `favicon.ico` (root + demo-assets duplicate'leri, V2'de temizlenecek)
- [ ] **5 QR seed:** `docker compose exec backend python manage.py shell -c "
  from apps.qr.models import QRCode
  print(QRCode.objects.filter(organization__slug='modern-cafe').count())"` →
  **>= 5**

---

## 10 Adım Demo Akışı

### Step 1 — Public sayfa açılır, kapak + logo görünür

**Eylem:** Tarayıcıda `http://localhost:3000/m/modern-cafe` (veya `?locale=en`).

**Beklenen:**
- Hero: Modern Cafe logo (üst sol), kapak görseli (üst banner)
- Kategoriler listelenmiş
- Header'da WhatsApp + Telefon CTA butonları görünür
- Footer'da dil seçici (TR/EN) + instagram link

**Kanıt:**
```bash
# Public endpoint
curl -fsS http://localhost:8000/api/v1/public/menus/modern-cafe?locale=tr | jq .data.business.name
# "Modern Cafe"
```
- [ ] Screenshot: `docs/screenshots/01-public-page.png` (manuel)
- [ ] Console error: 0

---

### Step 2 — Sticky nav scroll + aktif kategori state

**Eylem:** Sayfayı scroll et.

**Beklenen:**
- Kategori nav sticky (üstte sabit kalır)
- Aktif kategori görünür viewport'a girdiğinde highlighted olur
- Tıklanan kategoriye smooth scroll

**Kanıt:**
- [ ] Manuel: dev tools → scroll event listener var (`IntersectionObserver`)
- [ ] Screenshot: `docs/screenshots/02-sticky-nav.png`

---

### Step 3 — Item detail drawer açılır, allergens/tags

**Eylem:** "Latte" item'ına tıkla.

**Beklenen:**
- Bottom drawer (mobile) veya modal (desktop) açılır
- Item fotoğrafı, açıklama, fiyat (95,00 ₺)
- Allergenler (🥛 Süt) ikon + etiket
- Dietary tags (🌱 Vejetaryen) ikon + renkli etiket
- Kapatma butonu çalışır

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/03-item-drawer.png`
- [ ] DB doğrulama:
  ```bash
  docker compose exec backend python manage.py shell -c "
  from apps.menu.models import MenuItem
  latte = MenuItem.objects.get(slug='latte', category__menu__organization__slug='modern-cafe')
  print('allergens:', list(latte.allergens.values_list('code', flat=True)))
  print('tags:', list(latte.dietary_tags.values_list('code', flat=True)))
  "
  # ['milk'] / ['vegetarian']
  ```

---

### Step 4 — LocaleSelector → EN, language_change event loglanır

**Eylem:** Header'daki dil seçiciden "EN" tıkla.

**Beklenen:**
- Tüm UI string'leri İngilizce'ye döner
- Kategori adları, item adları, CTA butonları EN
- `POST /api/v1/public/events` 204 döner, `event_type=language_change`

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/04-locale-en.png`
- [ ] DB event kontrolü:
  ```bash
  docker compose exec backend python manage.py shell -c "
  from apps.analytics.models import MenuViewEvent
  from django.utils import timezone
  from datetime import timedelta
  recent = MenuViewEvent.objects.filter(
      event_type='language_change',
      created_at__gte=timezone.now()-timedelta(minutes=5)
  )
  print('Son 5 dk language_change:', recent.count())
  "
  ```
- [ ] Network tab: `POST /api/v1/public/events` → 204

---

### Step 5 — WhatsApp + Phone CTA click event'leri

**Eylem:** Header'daki WhatsApp ve Telefon butonlarına tıkla (yeni sekme açılır,
hemen geri dön).

**Beklenen:**
- WhatsApp → `https://wa.me/...` açılır
- Telefon → `tel:+90...` dialer tetikler
- Her ikisi de `whatsapp_click` ve `phone_click` event'leri loglar

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/05a-whatsapp.png`, `05b-phone.png`
- [ ] DB:
  ```bash
  docker compose exec backend python manage.py shell -c "
  from apps.analytics.models import MenuViewEvent
  print('whatsapp:', MenuViewEvent.objects.filter(event_type='whatsapp_click').count())
  print('phone:', MenuViewEvent.objects.filter(event_type='phone_click').count())
  "
  ```

---

### Step 6 — Login → dashboard redirect

**Eylem:** `/login` → email + password → submit.

**Beklenen:**
- Login sonrası `/admin/dashboard` redirect
- Cookie `sessionid` set edilmiş
- Dashboard'da Modern Cafe bilgisi + counts görünür

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/06-dashboard.png`
- [ ] curl ile login flow:
  ```bash
  curl -fsS -c /tmp/c.txt http://localhost:8000/api/v1/auth/csrf > /dev/null
  TOKEN=$(awk '/csrftoken/ {print $7}' /tmp/c.txt)
  curl -fsS -b /tmp/c.txt -c /tmp/c.txt \
    -H "X-CSRFToken: $TOKEN" -H "Content-Type: application/json" \
    -X POST http://localhost:8000/api/v1/auth/login \
    -d '{"email":"owner@modern-cafe.com","password":"demo123!"}'
  curl -fsS -b /tmp/c.txt http://localhost:8000/api/v1/me
  # {"data":{"email":"owner@...","id":1,...}}
  ```

---

### Step 7 — Recent events listesi (en az 2 olay)

**Eylem:** Dashboard'daki "Son Etkinlikler" widget'ı.

**Beklenen:**
- En az 2 audit event (login + dil değişikliği veya bir item update)
- Actor email, action, target_repr, timestamp görünür

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/07-recent-events.png`
- [ ] DB:
  ```bash
  docker compose exec backend python manage.py shell -c "
  from apps.audit.models import AuditEvent
  print(AuditEvent.objects.count(), 'audit events')
  "
  ```

---

### Step 8 — Latte 95 → 105, audit event price_changed

**Eylem:** `/admin/menus/1/items/<latte_id>/edit` → fiyat alanını 95'ten 105'e
değiştir → kaydet.

**Beklenen:**
- Save sonrası success toast
- `/admin/menus/1` listesinde Latte fiyatı 105,00 ₺ güncellenmiş
- Audit event `action=update, target_type=menu_item, payload={"price":"105.00","old_price":"95.00"}`

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/08-price-edit.png`
- [ ] Audit event:
  ```bash
  docker compose exec backend python manage.py shell -c "
  from apps.audit.models import AuditEvent
  e = AuditEvent.objects.filter(target_type='menu_item', target_repr='Latte').latest('created_at')
  print('payload:', e.payload)
  "
  # {'price': '105.00', 'old_price': '95.00', ...}
  ```

---

### Step 9 — Public refresh → yeni fiyat görünür

**Eylem:** Yeni sekmede `/m/modern-cafe` aç (cache bypass için hard reload).

**Beklenen:**
- Latte fiyatı artık 105,00 ₺ (önceki adımdaki güncellemenin yansıması)
- `compare_at_price` alanı varsa eski fiyat görünür (Sprint 5A feature)

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/09-public-refresh.png`
- [ ] curl:
  ```bash
  curl -fsS http://localhost:8000/api/v1/public/menus/modern-cafe?locale=tr | \
    jq '.data.categories[].items[] | select(.slug=="latte") | {price, compare_at_price}'
  # {"price":"105.00","compare_at_price":"95.00"}
  ```

---

### Step 10 — Analytics dashboard dolu (events + lang dist)

**Eylem:** `/admin/analytics`.

**Beklenen:**
- Stat cards: today_views > 0, week_views > 0, event_counts dict dolu
- Daily views chart (SVG line chart, son 30 gün)
- Language distribution (TR vs EN oranları, pie/donut SVG)
- Top QR codes listesi (en az 3)

**Kanıt:**
- [ ] Screenshot: `docs/screenshots/10-analytics.png`
- [ ] curl:
  ```bash
  curl -fsS -b /tmp/c.txt \
    "http://localhost:8000/api/v1/admin/analytics/overview?days=30" | \
    jq '.data | {today_views, week_views, event_counts, language_distribution, top_qr_codes}'
  ```

---

## Bonus Akışlar

V1 demo'su olmasa da güzel "wow" anları:

- [ ] **QR PNG download:** `/admin/qr-codes` → bir QR'ın download butonuna tıkla →
  PNG dosyası inecek.
  ```bash
  curl -fsS -b /tmp/c.txt \
    http://localhost:8000/api/v1/admin/qr-codes/<id>/download \
    -o /tmp/qr-test.png
  file /tmp/qr-test.png
  # PNG image data, 600 x 600
  ```

- [ ] **QR ile gelen ziyaretçi:** `/m/modern-cafe?qr=<id>` → qr_open event loglanır,
  scan_count artar.
  ```bash
  docker compose exec backend python manage.py shell -c "
  from apps.qr.models import QRCode
  qr = QRCode.objects.get(id=<id>)
  print('scan_count:', qr.scan_count)
  "
  ```

- [ ] **Theme customization:** `/admin/theme` → primary color değiştir →
  `/m/modern-cafe` hard reload → yeni renk yansır.

- [ ] **Branch switching:** Birden fazla branch varsa `/m/modern-cafe?branch=<slug>`
  → şubeye özel menü.

- [ ] **Media upload:** `/admin/media` → 5 MB altı PNG/JPG yükle → URL döner →
  item'da image olarak set et.

---

## V1 Definition of Done

Tüm bu checklist geçtiğinde V1 demo-ready:

### Functional
- [ ] Tüm 10 adım geçti
- [ ] Bonus akışlar geçti (en az QR download + qr_open)

### Quality
- [ ] Backend test **134 yeşil**
- [ ] Frontend build temiz
- [ ] TypeScript temiz
- [ ] Lighthouse mobile: Performance > 80, Accessibility > 90, SEO > 90 (manuel)

### Documentation
- [ ] Production config dokümante (Sprint 6A) ✅
- [ ] AI logo + kapak render (Sprint 6B) ✅
- [ ] Demo script dokümante (DEMO_SCRIPT.md) ✅
- [ ] API contract dokümante (API_CONTRACT.md) ✅
- [ ] Troubleshooting runbook (TROUBLESHOOTING.md) ✅
- [ ] DECISIONS D-001..D-020 tutarlı ✅

### Operational
- [ ] `docker compose up` 5 dakikada ayağa kalkıyor
- [ ] `seed_demo` idempotent
- [ ] Smoke test (`scripts/smoke_test.sh`) exit 0
- [ ] Sentry DSN placeholder env'de (V2'de gerçek DSN)

---

## Demo Sırasında Sorun Çıkarsa

1. Issue aç, label `demo-blocking`.
2. Sprint backlog'a ekle (V1.1 hotfix).
3. Demo günü **ekran kaydı al** — sonra issue'ya ekle.
4. Bu checklist'i güncelle — aynı sorun ikinci kez olmasın.

---

## Changelog

- **2026-09-26 (V1)** — İlk acceptance checklist, Sprint 6C.
