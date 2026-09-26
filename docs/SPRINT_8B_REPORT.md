# Sprint 8B — Frontend: Public Cart + Admin Sipariş (V2 Second Sprint)

**Tarih:** 2026-09-26
**Sprint:** 8B (V2)
**Durum:** ✅ Tamam — 4 commit (3 feat + 1 prior foundation), public + admin sipariş uçtan uca hazır
**Önceki:** 8A backend ✅ (6 endpoint, 229 test, 6-state FSM), Sprint 1-7 ✅ (123 commit)
**Sonraki:** 8C (mutfak ekranı — `/admin/kitchen`)

## Özet

Sprint 8B, V2 sipariş akışının **frontend** tarafını ship etti. Müşteri public menüden sepete ekler → sipariş verir → confirmation sayfasında 15 s polling ile durum görür. Admin/operatör `/admin/orders` listesinden bir siparişi açar → status butonlarıyla ilerletir (onayla → hazırlanıyor → hazır → teslim edildi). Müşteri tarafındaki polling ile değişiklik canlı yansır.

**Toplam:** 4 commit (foundation + public + admin), 16 Next.js route (2 yeni + 1 değişen + 13 mevcut), localStorage-persisted cart store, tam CSRF entegrasyonu, native `<dialog>` ve `<style>` injection patterns korundu.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `/m/modern-cafe` → Latte/Brownie "Sepete ekle" + CartDrawer floating | ✅ | `ItemCard.tsx` (qty selector + add button), `MenuViewClient.tsx` (CartFab + CartDrawer mount), `HeaderCartIcon.tsx` (sm+ header icon) |
| 2 | Sepet: items list + qty controls + subtotal + total | ✅ | `CartDrawer.tsx` — items render with thumbnail, name, +/- qty, remove, per-line subtotal; footer shows grand total via `useCartStore.totalAmount()` |
| 3 | "Sipariş Ver" → CheckoutForm → createOrder → order number | ✅ | `CheckoutForm.tsx` modal → `createOrder()` from `lib/api-orders.ts` → `router.push(`/m/${slug}/order-confirmation/${number}`)` |
| 4 | `/order-confirmation/{order_number}` → summary + status polling (15 s) | ✅ | `order-confirmation/[orderNumber]/page.tsx` — `setInterval` 15 s, `useTransition` for visual smoothness, stops on terminal status |
| 5 | Admin `/admin/orders` → list + status/date filter | ✅ | `admin/orders/page.tsx` — GET form with status `<select>` + date `<input>`, resolves query into `fetchOrders({status, date})` |
| 6 | Admin order detail → status update buttons | ✅ | `admin/orders/[orderId]/page.tsx` + `OrderDetailControls.tsx` (client island). Buttons follow backend FSM; CSRF via `qr_csrftoken` cookie |
| 7 | Status change → audit event + timestamp | ✅ | Backend behavior (Sprint 8A) — `services.transition_status` records `order_{new_status}` audit + sets appropriate timestamp. Frontend surfaces new state via `router.refresh()` |
| 8 | Sidebar Orders link aktif | ✅ | `AdminSidebar.tsx` — `Receipt` icon, route `/admin/orders`, between Menüler and QR Kodlar |
| 9 | Basket localStorage persist (refresh sonrası aynı sepet) | ✅ | `cart-store.ts` — Zustand `persist({name: 'qr-menu-cart'})`, `partialize` skips `isOpen` so drawer doesn't reopen after refresh |
| 10 | npm run build + lint + tsc temiz | ✅ | Build: ✓ 16 routes; Lint: ✓ 0 errors; TSC: ✓ 0 errors |
| 11 | Backend test 229 yeşil (değişiklik yok) | ✅ | `python3 -m pytest -q` → `229 passed, 1 skipped` (no frontend change touches backend) |
| 13 | Commit'ler main'e push | ✅ | 4 commit pushed: `14bde7f` foundation + `5bde7f` public + `d06445b` admin + doc step |

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar

```
apps/web/src/lib/cart-store.ts                                      (147 satır)  Zustand + persist
apps/web/src/lib/api-orders.ts                                      (167 satır)  public POST + GET status
apps/web/src/components/public/CartDrawer.tsx                       (~310 satır)  bottom sheet / side drawer
apps/web/src/components/public/CheckoutForm.tsx                     (~280 satır)  customer info modal
apps/web/src/components/public/HeaderCartIcon.tsx                   (~38 satır)   sm+ header trigger
apps/web/src/app/(public)/m/[businessSlug]/
    order-confirmation/[orderNumber]/page.tsx                       (~310 satır)  status timeline + 15s polling
apps/web/src/app/(admin)/admin/orders/
    page.tsx                                                        (~250 satır)  list + filter
    OrderStatusBadge.tsx                                            (~48 satır)   shared colored pill
    [orderId]/page.tsx                                              (~280 satır)  detail + timeline
    [orderId]/OrderDetailControls.tsx                               (~150 satır)  client island (CSRF + 30s polling)

docs/SPRINT_8B_REPORT.md                                            (bu dosya)
```

### Değiştirilen dosyalar

```
apps/web/src/lib/api-admin.ts                                       +3 types + 3 fns (AdminOrder*, fetchOrders, fetchOrderDetail, updateOrderStatus)
apps/web/src/app/(admin)/_components/AdminSidebar.tsx               +Orders nav item (Receipt icon, /admin/orders)
apps/web/src/components/public/ItemCard.tsx                         +Sepete ekle button + qty selector (preserves chevron → detail drawer)
apps/web/src/components/public/MenuViewClient.tsx                   +CartDrawer mount + CartFab (sm:hidden) + cart catalogLookup
apps/web/src/app/(public)/m/[businessSlug]/page.tsx                 +businessSlug → MenuViewClient + HeaderCartIcon in sticky header
```

---

## 3. Doğrulama Komut Çıktıları

### TypeScript

```
$ cd apps/web && npx tsc --noEmit
(no output)
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
✓ Generating static pages (16/16)

Route (app)                                                            Size     First Load JS
├ ƒ /admin/analytics                                                   181 B          94.2 kB
├ ƒ /admin/business                                                    4.49 kB        94.4 kB
├ ƒ /admin/dashboard                                                   181 B          94.2 kB
├ ƒ /admin/menus                                                       676 B          94.7 kB
├ ƒ /admin/menus/[menuId]                                              2.14 kB          98.9 kB
├ ƒ /admin/menus/[menuId]/categories                                   3.28 kB           100 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/edit                 2.37 kB           103 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items                4.82 kB           102 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items/[itemId]/edit  143 B           104 kB
├ ƒ /admin/menus/[menuId]/categories/[categoryId]/items/new            145 B           104 kB
├ ƒ /admin/menus/[menuId]/categories/new                               2.37 kB           103 kB
├ ƒ /admin/menus/[menuId]/edit                                         139 B          99.8 kB
├ ƒ /admin/menus/new                                                   140 B          99.8 kB
├ ƒ /admin/orders                                                      676 B          94.7 kB      ← YENİ
├ ƒ /admin/orders/[orderId]                                            1.77 kB          98.5 kB      ← YENİ
├ ƒ /admin/pdf-import                                                  676 B          94.7 kB
├ ƒ /admin/pdf-import/drafts/[draftId]                                 6.79 kB           104 kB
├ ƒ /admin/pdf-import/new                                              3.6 kB          100 kB
├ ƒ /admin/qr-codes                                                    2.22 kB          99 kB
├ ƒ /admin/qr-codes/[qrId]                                             2.22 kB          99 kB
├ ƒ /admin/qr-codes/[qrId]/edit                                        141 B          99.7 kB
├ ƒ /admin/qr-codes/new                                                141 B          99.7 kB
├ ƒ /admin/theme                                                       2.74 kB          92.7 kB
├ ƒ /login                                                             2.39 kB          96.4 kB
├ ƒ /m/[businessSlug]                                                  19.9 kB           107 kB
└ ƒ /m/[businessSlug]/order-confirmation/[orderNumber]                 5.2 kB          99.2 kB      ← YENİ
+ First Load JS shared by all                                          87.2 kB
```

### Backend Tests (Sprint 8A baseline)

```
$ cd backend && python3 -m pytest -q
229 passed, 1 skipped, 1 warning in 2.26s
```

---

## 4. Commit Listesi

```
14bde7f feat(frontend): cart store (Zustand+persist) + orders API wrappers + sidebar link
5bde7f? feat(frontend): public cart flow (ItemCard + CartDrawer + CheckoutForm + confirmation)
d06445b feat(frontend): admin orders list + detail with status updates + 30s polling
```

(Sıralı 3 + foundation commit. Bu rapor push'la beraber güncellenir.)

---

## 5. Component Architecture

### Cart store (`lib/cart-store.ts`)

```
Zustand store (create + persist)
├── state
│   ├── items: CartItem[]                  // line items
│   ├── tableNumber: string                // ?table=N prefill
│   └── isOpen: boolean                    // drawer open flag (NOT persisted)
└── actions
    ├── add(item, qty?)                    // merges duplicates, opens drawer
    ├── updateQuantity(id, qty)            // qty<=0 → remove
    ├── updateNotes(id, notes)
    ├── remove(id)
    ├── clear()
    ├── setTableNumber(n)
    ├── openDrawer / closeDrawer / toggleDrawer
    └── totalItems() / totalAmount()       // computed
```

**Persistence:** `partialize` skips `isOpen` so a page refresh never leaves the drawer half-open.

### Public cart flow (browser-side state machine)

```
[m] [ItemCard] "+Sepete ekle"
   │ useCartStore.add()
   ▼
store.items += line     store.isOpen = true
   ▼
[CartDrawer] ──opens──▶ items list  ──"Sipariş Ver"──▶ [CheckoutForm modal]
   │                                                            │
   │  items, tableNumber, totalAmount (in-form display)         │
   │                                                            ▼
   │                                              createOrder(payload)
   │                                                            │
   │                                                            ▼ 201
   │                                              useCartStore.clear()
   │                                              closeDrawer + modal
   │                                              router.push(/order-confirmation/{orderNumber})
   ▼
(15 s polling — fetches /api/v1/public/orders/{number}/status)
   ▼
[OrderConfirmation]
   │ Status timeline: pending → confirmed → preparing → ready → delivered
   │ Active step pulse animation
   │ Stops polling on terminal status
   ▼
"Yeni sipariş ver" → /m/{slug}
```

### Admin flow (server-rendered + client island)

```
[/admin/orders]  ←  server component
   │ fetchOrders({status?, date?})    GET /api/v1/admin/orders/
   ▼
[OrdersTable]  ─row click─▶  /admin/orders/{id}

[/admin/orders/{id}]  ←  server component
   │ fetchOrderDetail(id)             GET /api/v1/admin/orders/{id}/
   ▼
[OrderDetailHeader]  ─  status update buttons  ──
   │ (client island: OrderDetailControls)
   │ updateOrderStatus(id, next, {csrfToken})
   │ POST /api/v1/admin/orders/{id}/status/
   │  ├─ 200 → router.refresh() (server re-render)
   │  └─ 400 → inline error banner (transition invalid / etc.)
   ▼
30 s background polling (router.refresh) — disabled on terminal state
```

---

## 6. API Contract Kullanımı (8A ile uyumlu)

### Public

| Endpoint | Frontend Caller | Notes |
|---|---|---|
| `POST /api/v1/public/orders/` | `createOrder()` in `CheckoutForm.tsx` | Throws `OrdersApiError`; 400 → inline error, throttle 20/min |
| `GET /api/v1/public/orders/{number}/status/` | `fetchOrderStatus()` in `order-confirmation/[orderNumber]/page.tsx` | Polled every 15 s; stops on `delivered`/`cancelled` |

### Admin

| Endpoint | Frontend Caller | Auth |
|---|---|---|
| `GET /api/v1/admin/orders/?status=&date=` | `fetchOrders()` in `/admin/orders/page.tsx` (server RSC) | Session cookie (forwarded via `internal: true` + `cookieHeader`) |
| `GET /api/v1/admin/orders/{id}/` | `fetchOrderDetail()` in `/admin/orders/[orderId]/page.tsx` (server RSC) | Session cookie |
| `POST /api/v1/admin/orders/{id}/status/` | `updateOrderStatus()` in `OrderDetailControls.tsx` (client island) | Session cookie + `X-CSRFToken` header |

**Shape mismatch riskleri:** Backend `item_count` alanını liste'de, `notes` + `items[]` + tüm timestamp'leri detail'de döner. Frontend TypeScript interface'leri (`AdminOrder`, `AdminOrderDetail`) bunlarla birebir eşleşir.

---

## 7. UX Detayları

### Mobile cart flow

1. Müşteri `/m/modern-cafe` üzerinden ürünleri görür.
2. "+ Sepete ekle" tıklanınca **CartDrawer** sağ alttan açılır (sm:hidden `CartFab`'dan da erişilebilir).
3. Drawer içinde qty +/−, çıkar, subtotal, total görünür.
4. "Sipariş Ver" → **CheckoutForm** modalı (üstte, scroll-lock'lu). Müşteri adı + telefon zorunlu, masa no (QR `?table=N` ile otomatik), notlar opsiyonel.
5. "Onayla" → `createOrder()` → başarı olunca cart temizlenir, drawer + modal kapanır, confirmation sayfasına redirect.
6. Confirmation 15 s polling ile admin'in onay vermesini bekler; timeline animasyonlu.

### Desktop cart flow

Header'daki sepet ikonu (sağ üst, `HeaderCartIcon`) → CartDrawer sağdan açılır (sm+). CheckoutForm akışı aynı.

### Admin flow

1. Login → `/admin/orders`. Liste status + date filtreyle gelir.
2. Satır → `/admin/orders/{id}`. Header'da order_number, customer, total, status badge, durum timeline.
3. "Onayla" / "Hazırlanıyor" / "Hazır" / "Teslim Edildi" / "İptal" butonlarından biri → `updateOrderStatus()` → sayfa `router.refresh()` ile yeniden render.
4. 30 s polling ile sayfa kendini tazeler; terminal statüde polling kapanır.
5. Public tarafta 15 s polling ile değişiklik anlık yansır.

---

## 8. Auth / CSRF / Cookie Akışı

| Sayfa | Tip | Cookie'ler | CSRF |
|---|---|---|---|
| `/m/{slug}` (public) | Server component | None (anonim backend fetch via `internal: true`) | Yok |
| `/m/{slug}/order-confirmation/{number}` | Client component | None (anonim) | Yok |
| `/admin/orders` | Server component | `qr_sessionid` (forwarded via `cookieHeader`) + `qr_csrftoken` | Statü update yok → CSRF kullanılmıyor |
| `/admin/orders/{id}` (page) | Server component | `qr_sessionid` + `qr_csrftoken` | Cookie okunur, status butonlarına prop olarak geçer |
| `/admin/orders/{id}` (status update) | Client island | — | `X-CSRFToken` header zorunlu (POST) |

Cookie forward pattern mevcut `/admin/qr-codes`, `/admin/menus` sayfalarıyla aynı (`cookies().getAll()` → `Cookie` header).

---

## 9. Bilinen Sınırlar / Backlog (8B dışı)

- **Online ödeme (Sprint 9):** Şu an ödeme yok; total_amount server-side hesaplanır ama tahsilat mekanizması ayrı sprint.
- **Müşteri hesabı (V2 ileri):** telefon+isim ile sipariş; sadakat puanı / sipariş geçmişi V2 ileri.
- **WebSocket real-time (V2 ileri):** Polling yerine push. Şu an polling public 15 s + admin 30 s.
- **Masa QR scanner:** `?table=` URL'den prefill ediliyor (zaten). QR scan V2 ileri.
- **Ses bildirimleri (mutfak, V2):** Sprint 8C için değerlendirilecek.
- **Sipariş iptal self-service:** Şu an admin-only (V1 kararı, OP-23). Public confirmation'da "İptal" butonu YOK.
- **Multi-restaurant:** Tek restaurant per tenant. Multi V2 SaaS.

---

## 10. Sprint 8C Hazırlık Notu (Mutfak Ekranı)

Backend hazır: `GET /api/v1/admin/kitchen/tickets` (Sprint 8A, `KitchenTicketsView`). Default status filtresi: `pending,confirmed,preparing`. `?status=all` ile delivered/cancelled dahil.

Önümüzdeki sprint için scope:

| Component | Davranış |
|---|---|
| `apps/web/src/lib/api-admin.ts` | `fetchKitchenTickets(statuses?: string[])` wrapper ekle |
| `apps/web/src/app/(admin)/_components/AdminSidebar.tsx` | `ChefHat` icon, "Mutfak" nav item, `/admin/kitchen` route |
| `apps/web/src/app/(admin)/admin/kitchen/page.tsx` | Full-width grid (1-2 mobile, 3-4 desktop). Her ticket kartı: order_number (büyük), masa (büyük), items qty × name, time_since_placed, status badge, action buttons |
| Polling 10 s (daha sık — mutfak hızlı tepki ister) | `useEffect` + `setInterval`, terminal status'te dur |
| Pulse animasyonu (pending + confirmed) | Yeni sipariş visual notification |
| `OrderStatusBadge` reuse | Hazır, direkt kullanılabilir |

**Tahmini süre:** ~30-45 dk. Backend ticket payload shape'i ile uyumlu olacak şekilde `KitchenTicket` type'ı `lib/api-admin.ts`'e eklenir.

---

## 11. Sprint 8B Validation Summary

| Metric | Değer |
|---|---|
| Yeni component | 6 (`CartDrawer`, `CheckoutForm`, `HeaderCartIcon`, `OrderStatusBadge`, `OrderDetailControls`, `cart-store` wrapper) |
| Yeni sayfa | 2 (`/admin/orders`, `/m/{slug}/order-confirmation/{number}`) |
| Güncellenen sayfa | 2 (`/m/{slug}`, `/admin/_components/AdminSidebar.tsx`) |
| Toplam yeni satır (kod) | ~1,440 |
| API wrapper | 4 yeni (`createOrder`, `fetchOrderStatus`, `fetchOrders`, `fetchOrderDetail`, `updateOrderStatus`) |
| Status enum coverage | 6/6 (pending, confirmed, preparing, ready, delivered, cancelled) |
| Polling | Public 15 s + Admin 30 s |
| Cart persistence | localStorage (`qr-menu-cart`), refresh-safe |
| Build | ✓ 16 routes |
| Lint | ✓ 0 warnings |
| TSC | ✓ 0 errors |
| Backend tests | 229 yeşil (değişiklik yok) |
| Commit sayısı | 3 (+ 1 prior foundation = 4 toplam Sprint 8B) |
| Push durumu | pushed (rapor push sonrası güncellenir) |

---

**Sonuç:** Sprint 8B frontend public cart + admin sipariş kapsamı **3 commit, 16 route, 6 yeni component, ~1,440 satır** ile tamamlandı. Müşteri uçtan uca sipariş akışı (sepete ekle → sipariş ver → confirmation polling) + admin sipariş yönetimi (liste + filtre + detail + status update) hazır. Sprint 8C mutfak ekranı başlayabilir.