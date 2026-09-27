# Sprint 8C — Frontend: Mutfak Ekranı (V2 Second Sprint — Final Piece)

**Tarih:** 2026-09-27
**Sprint:** 8C (V2) — V2 sipariş+operasyon feature'ının son parçası
**Durum:** ✅ Tamam — 1 commit (8 dosya: 5 yeni + 3 modified), mutfak ekranı uçtan uca hazır
**Önceki:** 8A backend ✅ (6 endpoint, 58 yeni order test, 6-state FSM), 8B frontend ✅ (müşteri cart + admin orders + 30s polling), Sprint 1-7 ✅
**Sonraki:** V2 backlog Sprint 9 seçimi (online ödeme / müşteri hesabı+sadakat / AI çeviri / multi-tenant)

## Özet

Sprint 8C, V2 sipariş+operasyon feature'ının üçüncü ve son parçası. Operatör mutfak tabletinden `/admin/kitchen` üzerinden canlı siparişleri görür, durumları ilerletir (Onayla → Hazırlamaya Başla → Hazır → Teslim Edildi / İptal). Pending/confirmed kartları yumuşak bir pulse animasyonu ile vurgulanır; ekran 10 s polling ile tazelenir.

**Toplam:** 1 commit (`614530d`), 8 dosya (5 yeni component + 3 modifiye), 1 yeni admin route, native `<style>` injection + app-router server component kalıpları korundu, backend 229 test yeşil (değişiklik yok).

Worker alt-sprint'in ortasında (15 dk) auth-expire nedeniyle durduruldu; API wrapper + sidebar + CSS + polling indicator + status tabs hazırdı. Root session kalan 2 dosyayı (page.tsx, ticket card) ve 1 küçük yardımcıyı (auto-refresher) yazıp doğrulamayı tamamladı.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `/admin/kitchen` route açılır ve ticket grid render eder | ✅ | `apps/web/src/app/(admin)/admin/kitchen/page.tsx` — server component, 1-4 col responsive grid |
| 2 | Bekleyen / onaylanan / hazırlanan / tümü sekmeleri + canlı sayım | ✅ | `KitchenStatusTabs.tsx` (4 tab) + tablo backend'den 4 paralel fetch ile doldurulur |
| 3 | Her kart: order number (mono, büyük), masa no, items list, mm:ss yaş, status badge | ✅ | `KitchenTicketCard.tsx` (header + meta + items + action row) |
| 4 | Action butonları: Onayla / Hazırlamaya Başla / Hazır / Teslim Edildi / İptal | ✅ | `NEXT_BY_STATUS` map (backend FSM ile aynı: pending→confirmed\|cancelled, confirmed→preparing\|cancelled, preparing→ready\|cancelled, ready→delivered) |
| 5 | Buton → backend state transition + audit + refresh | ✅ | `updateOrderStatus(id, next, {csrfToken})` (Sprint 8A API), sonra `router.refresh()` ile parent re-render |
| 6 | Per-line "qty × name" gösterimi, notlar ayrı vurgulanır | ✅ | `KitchenTicketCard` items section — qty chip + bold name + amber-50 background note |
| 7 | Pending/confirmed kartları için yumuşak pulse animasyonu | ✅ | `globals.css` `@keyframes kitchen-pulse` + `.kitchen-ticket-pending` className (sadece `pending`/`confirmed` durumlarında uygulanır); `@media (prefers-reduced-motion: reduce)` honoured |
| 8 | Polling 10 s — ekran otomatik yenilenir | ✅ | `KitchenAutoRefresher.tsx` (invisible client island) — `setInterval(10_000)` → `router.refresh()` |
| 9 | Manuel yenile butonu + "X saniye önce güncellendi" pill | ✅ | `KitchenPollingIndicator.tsx` — `Date.now()` 1 s tick + manuel refresh |
| 10 | Sidebar Mutfak nav item + ikon | ✅ | `AdminSidebar.tsx` — `ChefHat` icon, route `/admin/kitchen`, `Receipt` ile `QrCode` arasında |
| 11 | Filter URL-driven (`?status=pending`) | ✅ | `page.tsx` `resolveStatus(searchParams.status)` → KitchenStatusTabs `?status=...` mutation |
| 12 | Empty state (per-tab uygun mesaj) + Error state | ✅ | `AdminEmptyState` (per-status başlık + "Sipariş listesini aç" CTA), `AdminErrorState` (admin.kitchen.tickets_failed kodu) |
| 13 | CSRF entegrasyonu (`qr_csrftoken` cookie → header) | ✅ | `csrfToken` server'da `cookies()` ile okunur → prop olarak `KitchenTicketCard`'a geçirilir → `updateOrderStatus`'a |
| 14 | `npm run build` + `lint` + `tsc --noEmit` temiz | ✅ | Build ✓ (kitchen 4.24 kB), Lint ✓ 0 errors, TSC ✓ 0 errors |
| 15 | Backend test 229 yeşil (değişiklik yok) | ✅ | `python3 -m pytest -q` → `229 passed, 1 skipped` |
| 16 | Commit main'e push | ✅ | `614530d` → `git push` ✓ |

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar

```
apps/web/src/app/(admin)/admin/kitchen/
    page.tsx                                                         (~190 satır)  server component
    _components/KitchenStatusTabs.tsx                                (~76 satır)   client tabs + counts
    _components/KitchenPollingIndicator.tsx                          (~95 satır)   "X saniye önce" + manual refresh
    _components/KitchenTicketCard.tsx                                (~280 satır)  ticket card + state transitions
    _components/KitchenAutoRefresher.tsx                             (~30 satır)   invisible polling owner

docs/SPRINT_8C_REPORT.md                                              (bu dosya)
```

### Değiştirilen dosyalar

```
apps/web/src/app/(admin)/_components/AdminSidebar.tsx               +ChefHat icon import, +Kitchen nav item (Siparişler ile QR Kodlar arasında)
apps/web/src/app/globals.css                                         +@keyframes kitchen-pulse, .kitchen-ticket-pending className, prefers-reduced-motion override
apps/web/src/lib/api-admin.ts                                        +KitchenTicket + KitchenTicketItem + KitchenStatusFilter types, +fetchKitchenTickets()
```

---

## 3. Doğrulama Komut Çıktıları

### TypeScript

```
$ cd apps/web && npm run type-check
> qr-menu-web@0.1.0 type-check
> tsc --noEmit

(no output — clean)
```

### ESLint

```
$ cd apps/web && npm run lint
> qr-menu-web@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

### Next.js Build

```
$ cd apps/web && npm run build

✓ Compiled successfully
✓ Generating static pages (17/17)

Route (app)                                                            Size     First Load JS
┌ ○ /                                                                  141 B          87.3 kB
├ ○ /_not-found                                                        875 B          88.1 kB
├ ƒ /admin/analytics                                                   181 B          94.2 kB
├ ƒ /admin/business                                                    4.49 kB        94.4 kB
├ ƒ /admin/dashboard                                                   181 B          94.2 kB
├ ƒ /admin/kitchen                                                     4.24 kB           101 kB        ← YENİ
├ ƒ /admin/menus                                                       676 B          94.7 kB
├ ƒ /admin/menus/[menuId]                                              2.14 kB        98.9 kB
├ ƒ /admin/menus/[menuId]/categories                                   3.28 kB         100 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/edit                 2.37 kB        103 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items                4.82 kB        102 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items/[itemId]/edit  143 B           104 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items/new            145 B           104 kB
├ ƒ /admin/menus/[menuId]/categories/new                               2.37 kB        103 kB
├ ƒ /admin/menus/[menuId]/edit                                         139 B          99.8 kB
├ ƒ /admin/menus/new                                                   140 B          99.8 kB
├ ƒ /admin/orders                                                      676 B          94.7 kB
├ ƒ /admin/orders/[orderId]                                            1.77 kB        98.5 kB
├ ƒ /admin/pdf-import                                                  676 B          94.7 kB
├ ƒ /admin/pdf-import/drafts/[draftId]                                 6.79 kB         104 kB
├ ƒ /admin/pdf-import/new                                              3.6 kB          100 kB
├ ƒ /admin/qr-codes                                                    2.22 kB         99 kB
├ ƒ /admin/qr-codes/[qrId]                                             2.22 kB         99 kB
├ ƒ /admin/qr-codes/[qrId]/edit                                        141 B          99.7 kB
├ ƒ /admin/qr-codes/new                                                141 B          99.7 kB
├ ƒ /admin/theme                                                       2.74 kB        92.7 kB
├ ƒ /login                                                             2.39 kB        96.4 kB
├ ƒ /m/[businessSlug]                                                  19.9 kB        107 kB
└ ƒ /m/[businessSlug]/order-confirmation/[orderNumber]                 5.21 kB        99.2 kB
+ First Load JS shared by all                                          87.2 kB
```

`/admin/kitchen` 4.24 kB route size + 101 kB first-load JS — kabul edilebilir (kitchen polling indicator + ticket card islands).

### Backend Tests

```
$ cd backend && python3 -m pytest -q
229 passed, 1 skipped, 1 warning in 2.72s
```

(229 baseline — Sprint 8A sonrası. Bu sprint frontend-only olduğu için backend değişmedi.)

---

## 4. Commit Listesi

```
614530d feat(frontend): kitchen display page + ticket cards + status tabs (Sprint 8C)
```

8 dosya (5 yeni, 3 modified). Sprint 8C'nin tamamı tek commit'te — küçük sprint (mutfak ekranı tek dosya), conventional commit formatında.

---

## 5. Component Architecture

### Data flow

```
[/admin/kitchen?status={pending|confirmed|preparing|all}]   ← server component
   │
   │ cookies() → Cookie header forwarded → internal: true
   │ Promise.all([
   │   fetchKitchenTickets(['pending']),
   │   fetchKitchenTickets(['confirmed']),
   │   fetchKitchenTickets(['preparing']),
   │   fetchKitchenTickets(['all']),
   │ ])
   │
   │ Tab badge counts ← all 4 responses
   │ Active grid ← matching bucket
   ▼
[KitchenStatusTabs]  ───tab click──▶  router.push(?status=...)
[KitchenPollingIndicator]             "X saniye önce güncellendi" + manual refresh
[KitchenAutoRefresher]                setInterval(10s) → router.refresh()  ← INVISIBLE
   │
   ▼
grid of [KitchenTicketCard]
   │
   │ Action button click → updateOrderStatus(id, next, {csrfToken})
   │                       → POST /api/v1/admin/orders/{id}/status/
   │                       → on success → router.refresh() (re-render with new status)
   ▼
(Each card re-renders with new status; if next status moves card out of current tab, it disappears)
```

### State machine (kitchen view)

```
                 ┌─────────────────────┐
                 │ pending             │
                 │ (pulse)             │
                 └────┬────────┬───────┘
                      │ confirm│ cancel
                      ▼        ▼
            ┌─────────────────┐  ┌──────────────┐
            │ confirmed       │  │ cancelled    │
            │ (pulse)         │  │ (terminal)   │
            └────┬──────┬─────┘  └──────────────┘
                 │ start│ cancel
                 ▼      ▼
            ┌─────────────────┐
            │ preparing       │
            │ (no pulse)      │
            └────┬──────┬─────┘
                 │ ready│ cancel
                 ▼      ▼
            ┌─────────────────┐
            │ ready           │
            │ (no pulse)      │
            └────┬────────────┘
                 │ delivered
                 ▼
            ┌─────────────────┐
            │ delivered       │
            │ (terminal)      │
            └─────────────────┘
```

(Pulse animasyonu sadece `pending` ve `confirmed` kartlara uygulanır — operator peripheral vision'ı ile yeni/işlenmemiş siparişleri fark etsin. `preparing` zaten açıkça "üzerinde çalışılıyor" demek; pulse gerekmez.)

### Theme integration

Kitchen sayfası `text-primary`, `bg-surface`, `border-border` Tailwind theme tokens'ını kullanır — Sprint 4A theme config (D-014 inline CSS variables) ile birebir aynı yüzey. Modern Cafe warm-tone primary (`#E07856`) pulse keyframe'inde kullanılır (`rgba(224, 120, 86, 0.15)`) — operator view'da brand bütünlüğü korunur.

---

## 6. V2 Sipariş+Operasyon Feature Özeti (Sprint 8 üçlüsü tamamlandı)

Sprint 8A (backend), 8B (public+admin frontend), 8C (mutfak frontend) ile V2'nin ikinci büyük feature'ı **uçtan uca hazır**:

| Kullanıcı | Akış | Endpoint'ler |
|---|---|---|
| **Müşteri (public)** | QR menüden sepete ekler → sipariş verir → confirmation sayfasında 15 s polling ile canlı durum görür | `POST /api/v1/public/orders` + `GET /api/v1/public/orders/{number}/status` + `GET /api/v1/public/menus/{slug}` |
| **Admin/operatör (sipariş)** | Sipariş listesinden detaya girer → status butonları ile ilerletir → müşteri canlı görür | `GET /api/v1/admin/orders` + `GET /api/v1/admin/orders/{id}` + `POST /api/v1/admin/orders/{id}/status/` |
| **Mutfak (kitchen)** | Canlı ticket grid → tek tıkla onayla/hazırla/hazır/teslim et → müşteri anlık görür | `GET /api/v1/admin/kitchen/tickets` + aynı status endpoint |

**Test state:** Backend 229 yeşil test (171 baseline + 37 PDF + 58 order - 37 revoke = 229). FSM 6 transition ile doğrulanmış. Audit her transition'da `order_{new_status}` event'i yazıyor. Snapshot price+name korunuyor. Throttle 20/min public'te.

**Operasyonel değer:**
- Müşteri için: QR menüden sipariş, "Hazır!" bildirimi.
- Restoran için: Manuel telefon/telefon zinciri yok, mutfak tablet'i tek canlı kaynak.
- Geliştirici için: 6-state FSM + state machine service + audit trail V2 ileri ödeme/çevrimdışı özellikleri için temiz.

---

## 7. Bilinen Sınırlar / V2 İleri Notlar

1. **WebSocket yok.** 10 s polling mutfak için yeterli (operator tablet başında). Real-time push V2 ileri — backend'de channels + Redis pub/sub gerek.
2. **Ses bildirimi yok.** Yeni sipariş geldiğinde "ping" çalması V2 ileri (Notification API + kullanıcı izni).
3. **Çoklu mutfak ekranı senkronizasyonu.** Birden fazla şube/istasyon için tek bir board'a bağlanma yok — V2 ileri multi-tenant tenant switcher ile gelir.
4. **İşlem geri alma (undo) yok.** Admin yanlışlıkla "İptal" basarsa audit event kalıyor ama UI'da revert butonu yok — V2 ileri (gerçek iptal email/SMS ile birlikte).
5. **Allergen/notes highlight.** Per-line notes şu an amber-50 background — gelecekte allergen (gluten/süt/yumurta vb.) uyarıları için yeni görsel treatment.

---

## 8. Karar Geçmişi İlişkisi

| Karar | Açıklama |
|---|---|
| **D-022** | Order + Kitchen Flow Pattern — polling 15s public / 10s kitchen / 30s admin'e kadar uygulandı; 6-state FSM ile aynı spec |
| **OP-20** | Polling real-time — WebSocket kararı V2+ olarak öteleniyor, 10s polling operatör UI için yeterli |
| **OP-22** | Masa no opsiyonel V1 — `table_number` zorunlu değil, KitchenTicketCard'da fallback `—` gösterimi |
| **D-014** | Theme override inline CSS variables — Kitchen sayfası theme tokens kullanır, pulse animasyonu `text-primary` accent ile uyumlu |

---

## 9. Sprint 9 İçin V2 Backlog Önerileri

Sprint 8C ile V2'nin sipariş+operasyon feature'ı bitmiş oldu. V2 backlog'tan Sprint 9 için dört ana yön (hangisini seçmek istersen):

1. **Online Ödeme (Stripe + iyzico/PayTR)** — checkout'ta kredi kartı / 3D Secure / yerel ödeme yöntemleri. Sipariş onayı ödeme onayına bağlanır.
2. **Müşteri Hesabı + Sadakat Puanı** — telefon/email ile kayıt, sipariş geçmişi, her sipariş için puan, puanla ödeme.
3. **AI Çeviri + Ürün Açıklaması Üretimi** — mevcut menu verisi + AI provider ile otomatik çok dilli açıklama / SEO meta üretimi.
4. **Multi-Tenant Tenant Switcher** — birden fazla işletme tek hesap, sekme/alan switching, branch-aware analytics.

(Bağımsız olarak: gerçek VPS deploy + DNS + Sentry canlı (D-004, D-020) planlanan Hetzner + Cloudflare + Caddy konfigürasyonuyla.)

---

**Toplam V2 Sprint 8 Feature:** 12 commit, 3 sprint (8A + 8B + 8C). Müşteri → admin → mutfak → müşteri canlı döngüsü hazır.
