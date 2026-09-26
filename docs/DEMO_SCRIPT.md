# QR Menü V1 — Demo Senaryosu

**Sprint:** 6B (demo polish + AI görsel + meta tags + QR seed + script)
**Tarih:** 2026-09-26
**Tahmini süre:** 10-12 dakika

## Hazırlık

- **Backend + frontend çalışıyor:** `docker compose up -d`
- **Tarayıcı:** Chrome/Safari (mobile dev tools açık)
- **Admin login:** `admin@modern-cafe.local` / `change-me-demo-only`
- **Modern Cafe demo verisi:** 1 menu + 5 kategori + 25 ürün + 50 çeviri + 5 QR

## 10 Adımlık Demo Akışı

### 1. Public menüyü aç (müşteri gözü)

```
http://localhost:3000/m/modern-cafe
```

- Modern Cafe başlık + AI üretimi kapak görseli (golden hour kafe iç mekanı) + logo
- 5 kategori (kahveler, soğuk içecekler, tatlılar, kahvaltı, sandviçler)
- 25 ürün kart şeklinde listelenmiş
- sticky header (Modern Cafe logosu + EN/TR switch)
- bottom floating CTA (WhatsApp + Phone)

### 2. Kategori gez

- **"Kahveler"** tıkla → sticky nav scroll + aktif state (primary renk)
- **Latte (95 TL)** → `popular` badge (yeşil)
- **San Sebastian Cheesecake (175 TL)** → `featured` badge (altın)

### 3. Ürün detay

- **Latte** kartı tıkla → bottom-sheet drawer açılır
- TR description: "Buğdaylanmış süt ile yumuşatılmış, yumuşak içimli espresso..."
- Allergens: `dairy`
- Dietary tags: `popular`
- Close + swipe-down ile kapat

### 4. Locale switch (TR → EN)

- LocaleSelector (header'da globe ikonu) → EN
- Tüm metin İngilizce olur:
  - Türk Kahvesi → Turkish Coffee
  - Sıcak çikolata görünmez (kategori adları değişir)
  - Latte → Latte (zaten İngilizce)
- `language_change` event loglanır (analytics)

### 5. CTA click

- **WhatsApp button** (sağ alt floating) → `wa.me/905325550123` link'i yeni tab'de açılır
- `whatsapp_click` event loglanır
- **Phone button** (sol alt floating) → `tel:+902125550123` link'i dialer'ı açar
- `phone_click` event loglanır

### 6. Admin login

```
http://localhost:3000/login
```

- Email: `admin@modern-cafe.local`
- Password: `change-me-demo-only`
- → `/admin/dashboard` redirect

### 7. Dashboard (recent events)

- 5 stat card: 1 menu / 5 category / 25 item / 1 branch / 25 active item
- **Recent events** listesi:
  - Step 4: language_change (locale=en)
  - Step 5: whatsapp_click + phone_click
  - (boş olabilir, henüz etkileşim olmadıysa empty state)

### 8. Fiyat güncelleme (admin)

- `/admin/menus` → **Modern Cafe Menü** → **Latte** (V60 değil, Modern Cafe Latte)
- Fiyat: `95.00` → `105.00`
- **Save** → audit event: `price_changed` (95 → 105)
- Public payload real-time cache'siz, GET request'te güncel fiyat döner

### 9. Public'te yansıma (cross-tab)

- Tarayıcıda ayrı tab'da public sayfa aç (Step 1'deki)
- **Refresh** → Latte **105.00 TL** görünür (Step 2'deki ekran)
- < 1 dakika (cache yok, direkt DB)
- Fiyat değişikliği → audit event oluştu → admin dashboard recent events'te görünür (refresh sonrası)

### 10. Analytics dashboard

- `/admin/analytics`
- **3 stat card:** Bugün / Bu Hafta / Bu Ay görüntülenme (sayılar demo süresine göre)
- **Event breakdown:** menu_view (en yüksek), language_change (1), whatsapp_click (1), phone_click (1), qr_open (0)
- **Daily views chart:** Bugün spike (kırmızı bar)
- **Language distribution:** TR %70, EN %30 (donut chart)
- **Top QR codes:** Henüz yok (boş state, bonus step'te doldurulacak)

## Bonus: QR Scan Flow

### QR oluşturma

- `/admin/qr-codes` → 5 QR zaten seed'lenmiş (Kasa Önü, Masa 1-4)
- Bir QR tıkla → `/admin/qr-codes/{id}` → large QR preview PNG + **Download**
- Print veya screenshot al (gerçek demo için)

### Tarayıcıda test

```
http://localhost:3000/m/modern-cafe?qr=1
```

- Sayfa mount'ta `qr_open` event loglanır (`qr_id=1`)
- Admin → `/admin/analytics` → event breakdown'da `qr_open: 1`
- `/admin/qr-codes/{1}` → `scan_count` artar (Sprint 6B özelliği)

### QR Lifecycle

- Edit `/admin/qr-codes/{id}/edit` → label değiştir, is_active toggle
- Delete → soft delete (is_active=False, scan_count analytics geçmişi için korunur)

## Rollback / Recovery

Herhangi bir demo step başarısız olursa:

```bash
# DB reset
docker compose exec backend python manage.py seed_demo

# Frontend container rebuild (yeni görseller)
docker compose build frontend && docker compose up -d frontend

# Backend container rebuild (yeni seed)
docker compose build backend && docker compose up -d backend
```

## Demo Flow Checklist

- [ ] Step 1: Public sayfa açılır, kapak görseli görünür
- [ ] Step 2: Sticky nav ile kategori scroll
- [ ] Step 3: Drawer açılır, allergens/tags görünür
- [ ] Step 4: EN'e çevir, ürün adları değişir
- [ ] Step 5: WhatsApp + Phone CTA'lar tıklanabilir
- [ ] Step 6: Login başarılı, dashboard'a yönlenir
- [ ] Step 7: Recent events listesi (en az 2 olay: language + whatsapp)
- [ ] Step 8: Latte fiyat 95 → 105 güncellenir, audit event oluşur
- [ ] Step 9: Public'te refresh → yeni fiyat görünür
- [ ] Step 10: Analytics dashboard dolu görünür (event breakdown + lang dist)
- [ ] Bonus: QR PNG indir + URL ile tara + analytics'te qr_open event görünür

## Tahmini Süre

- Step 1-5 (müşteri gözü): ~5 dakika
- Step 6-10 (admin gözü): ~5 dakika
- Bonus QR flow: ~2 dakika
- **Toplam: ~12 dakika**

Demo sırasında herhangi bir issue olursa `/admin/dashboard` recent events'te hataları kontrol et, veya `docs/TROUBLESHOOTING.md`'ye bak.
