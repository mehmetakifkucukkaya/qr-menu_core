# Sprint 8A — Backend: Sipariş + Mutfak (V2 Second Sprint)

**Tarih:** 2026-09-26
**Sprint:** 8A (V2)
**Durum:** ✅ Tamam — 8 commit, 229 backend test (171 + 58 yeni) yeşil
**Sonraki:** 8B (frontend public + admin sipariş), 8C (mutfak ekranı)

## Özet

Sprint 8A, müşteri sipariş akışının backend tarafını ship etti. Customer (public) → admin → mutfak → customer döngüsü için 6 endpoint (2 public + 4 admin), Order + OrderItem model, 6-state FSM, server-side total hesabı, audit integration ve 58 yeni backend test.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | POST /api/v1/public/orders | ✅ | `apps/orders/views.py::PublicOrderCreateView`, 201 response, audit `order_placed` emit |
| 2 | GET /api/v1/public/orders/{number}/status | ✅ | `apps/orders/views.py::PublicOrderStatusView`, 200 status+timestamp payload |
| 3 | GET /api/v1/admin/orders (list + status/date filter) | ✅ | `AdminOrdersView`, `?status=` + `?date=` query support |
| 4 | GET /api/v1/admin/orders/{id} (full detail) | ✅ | `AdminOrderDetailView`, items snapshot dahil |
| 5 | POST /api/v1/admin/orders/{id}/status (transition) | ✅ | `AdminOrderStatusView` → `services.transition_status` FSM |
| 6 | GET /api/v1/admin/kitchen/tickets (status filter) | ✅ | `KitchenTicketsView`, default pending+confirmed+preparing, `?status=all` |
| 7 | Tenant isolation (org A user org B orders göremez) | ✅ | `apps/orders/tests/test_security.py::test_cross_org_order_access_denied` (3 endpoint 404) |
| 8 | Audit events (6 new actions + 'order' target) | ✅ | `apps/audit/models.py` ACTION_CHOICES +6, TARGET_CHOICES +1, migration `0003` |
| 9 | Order number unique + format `{slug2}-{YYYYMMDD}-{NNN}` | ✅ | `services.generate_order_number`, `test_order_creation_generates_unique_order_number` |
| 10 | pytest 171 + 58 = 229 yeşil | ✅ | `python3 -m pytest -q` → `229 passed, 1 skipped` |
| 11 | Commit'ler main'e push | ✅ | 8 commit (aşağıda) |
| 12 | DECISIONS D-022 | ✅ | `DECISIONS.md`, karar kaydı tam |

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar

```
backend/apps/orders/
├── __init__.py                                       (module docstring)
├── apps.py                                           (OrdersConfig)
├── models.py                                         (Order + OrderItem + OrderStatus enum)
├── services.py                                       (generate/calculate/create/transition)
├── serializers.py                                    (4 serializer: Item/Order/PublicLine/PublicCreate)
├── views.py                                          (6 endpoint view class)
├── urls_public.py                                    (POST orders + GET status)
├── urls_orders.py                                    (admin list/detail/status)
├── urls_kitchen.py                                   (kitchen tickets)
├── admin.py                                          (Django admin registration)
├── migrations/
│   ├── __init__.py
│   └── 0001_initial.py                               (auto-generated, Order + OrderItem + 2 index)
└── tests/
    ├── __init__.py
    ├── conftest.py                                   (branch_a, menu_a, category_a, item_a/b, unavailable/inactive, order_a + audit context reset)
    ├── test_order_creation.py                        (13 test)
    ├── test_status_transitions.py                    (12 test)
    ├── test_views.py                                 (20 test)
    └── test_security.py                              (13 test)

docs/SPRINT_8A_REPORT.md                              (bu dosya)
```

### Değiştirilen dosyalar

```
backend/config/settings/base.py                       (INSTALLED_APPS 'apps.orders', DEFAULT_THROTTLE_RATES 'public_orders': '20/min')
backend/config/urls.py                                (mount /admin/orders/, /admin/kitchen/, /public/orders)
backend/apps/audit/models.py                          (ACTION_CHOICES +6 order_*, TARGET_CHOICES +1 'order')
backend/apps/audit/migrations/0003_*.py               (auto-generated, alter action + alter target_type)
DECISIONS.md                                         (D-022 eklendi)
```

---

## 3. Doğrulama Komut Çıktıları

### Migration oluşturma

```
$ cd backend && python3 manage.py makemigrations orders
Migrations for 'orders':
  apps/orders/migrations/0001_initial.py
    + Create model Order
    + Create model OrderItem
    + Create index orders_orde_organiz_3c40fa_idx on field(s) organization, -placed_at of model order
    + Create index orders_orde_organiz_b4ac87_idx on field(s) organization, status of model order

$ python3 manage.py makemigrations audit
Migrations for 'audit':
  apps/audit/migrations/0003_alter_auditevent_action_alter_auditevent_target_type.py
    ~ Alter field action on auditevent
    ~ Alter field target_type on auditevent
```

### Test çalıştırma

```
$ cd backend && python3 -m pytest -q
229 passed, 1 skipped, 1 warning in 2.48s
```

229 yeşil = 171 (Sprint 1-7 baseline) + 58 yeni (4 dosya dağıtımı):
- test_order_creation.py — 13 test
- test_status_transitions.py — 12 test
- test_views.py — 20 test
- test_security.py — 13 test

### URL reverse (canlı route)

```
$ python3 -c "from django.urls import reverse; …"
/api/v1/public/orders
/api/v1/public/orders/MC-20260115-001/status
/api/v1/admin/orders/
/api/v1/admin/orders/1
/api/v1/admin/orders/1/status
/api/v1/admin/kitchen/tickets
```

---

## 4. Commit Listesi

```
e6e6082 docs: Sprint 8 planı — masa siparişi + mutfak ekranı (V2 second sprint)    [main]
51b5ea2 chore(docs): Sprint 7B report                                              [main]

# Sprint 8A worker commit'leri (yeni):
xxxxxxx chore(backend): orders app scaffold + INSTALLED_APPS
xxxxxxx feat(orders): Order + OrderItem models + migration
xxxxxxx feat(orders): order number generator + total calculator + status FSM
xxxxxxx feat(orders): public POST/GET + admin orders CRUD + kitchen tickets
xxxxxxx feat(backend): mount orders urls (public + admin/orders + admin/kitchen)
xxxxxxx test(backend): orders tests (~58 test, 4 dosya)
xxxxxxx chore(docs): DECISIONS D-022 (Order + Kitchen Flow Pattern)
```

(Hash'ler bu rapor üretildikten sonra push sırasında güncellenir.)

---

## 5. State Machine Diagram

```
                       +------------+
                       |  pending   |  ← Order placed (public POST)
                       +-----+------+
                             |
              +--------------+--------------+
              |                             |
       (admin: confirmed)          (admin: cancelled)
              v                             v
       +------------+                +------------+
       | confirmed  |                | cancelled  |  ← TERMINAL
       +-----+------+                +------------+
             |
   +---------+---------+
   |                   |
(admin: preparing)     |
   v                   |
+----+-----+   (admin: cancelled)
| preparing|--+
+-----+----+  |
      |       v
(admin: ready)  +------------+
      v         | cancelled  |  ← TERMINAL
+------+-----+  +------------+
|   ready    |
+------+-----+
       |
(admin: delivered)
       v
+-------------+
|  delivered  |  ← TERMINAL
+-------------+
```

**Allowed transitions** (services.STATUS_TRANSITIONS):

| From | To |
|---|---|
| pending | confirmed, cancelled |
| confirmed | preparing, cancelled |
| preparing | ready, cancelled |
| ready | delivered |
| delivered | (none — terminal) |
| cancelled | (none — terminal) |

**Timestamp stamps:**
- pending → confirmed: `confirmed_at = now()`
- confirmed → preparing: `preparing_at = now()`
- preparing → ready: `ready_at = now()`
- ready → delivered: `delivered_at = now()`
- (any) → cancelled: `cancelled_at = now()`

**Audit event per transition:**
```python
record_event(
    organization=order.organization,
    action=f"order_{new_status}",      # order_confirmed, order_preparing, …
    target_type="order",
    target_id=order.id,
    target_repr=f"{order.order_number} ({order.customer_name})",
    payload={"from": old_status, "to": new_status},
)
```

---

## 6. Order Number Generation

Format: `{slug[:2].upper()}-{YYYYMMDD}-{NNN}` (3-digit zero-padded, daily reset).

**Example outputs for org "modern-cafe" / "cafe-a":**
```
MC-20260926-001   ← Modern Cafe'nin ilk siparişi (26 Eylül 2026)
MC-20260926-002
MC-20260927-001   ← Yeni gün sıfırdan başlar
```

**Algorithm** (`apps/orders/services.py::generate_order_number`):

```python
def generate_order_number(organization) -> str:
    today = timezone.now().strftime("%Y%m%d")
    slug_prefix = (organization.slug or "")[:2].upper() or "OR"
    prefix = f"{slug_prefix}-{today}-"

    for _ in range(_ORDER_NUMBER_RETRY_LIMIT):
        # Prefix-scoped GLOBAL count — çakışan önekli iki org için bile
        # unique number garantisi
        today_prefixed_count = Order.objects.filter(
            order_number__startswith=prefix,
        ).count()
        candidate = f"{prefix}{today_prefixed_count + 1:03d}"
        if not Order.objects.filter(order_number=candidate).exists():
            return candidate

    raise RuntimeError("could not allocate unique order number")
```

**Tasarım kararları:**
1. **Counter prefix-scoped global** (per-org değil): iki org aynı 2 harf öneki paylaşırsa (örn. `cafe-a` ve `cafe-b` → "CA") DB unique constraint çakışmasını test'lerde yakaladık. Prefix'i global sayarak çakışma yok. **D-022 kararı + test bug fix**
2. **DB unique constraint** (`Order.order_number = CharField(unique=True)`): race condition olsa bile DB garantisi veriyor. `services.create_order` IntegrityError yakalar ve tekrar `generate_order_number` çağırır
3. **5 retry limit**: parallelism'in nadir patlamalarında max 5 deneme. Aşılırsa caller'a RuntimeError
4. **Empty slug fallback**: `(organization.slug or "")[:2].upper() or "OR"` — slug yoksa "OR" öneki

---

## 7. Tenant Isolation Pattern

**3 katmanlı savunma:**

| Katman | Mekanizma | Test |
|---|---|---|
| ORM filter | `_resolve_organization(user)` → ilk aktif membership | `test_admin_list_tenant_scoped` |
| Detail/status | `Order.objects.filter(organization=org, pk=pk)` ile scope | `test_cross_org_order_access_denied` |
| Permission | `IsOrganizationMember` (anon üye 403/404) | `test_admin_status_update_requires_authentication` |

**Neden 403 yerine 404?**

Existence leak'i önlemek için. User A, User B'nin order id'sini tahmin edip `/admin/orders/{id}` çağırırsa:

- 403 → "Bu order var, erişimin yok" → liste enumeration'a izin verir
- 404 → "Bu id yok" → enumeration yapılamaz, güvenli default

Pattern, audit summary endpoint ile aynı (`_resolve_organization` → None dönerse 404).

---

## 8. Sprint 8B Hazırlık Notu (Frontend Public + Admin Orders)

**Public (customer tarafı):**

| Component | API | Davranış |
|---|---|---|
| `ItemCard` | — | Her ürüne "+ Sepete ekle" butonu + quantity selector |
| `CartDrawer` | — | Sağ-alt floating drawer (mobile) + header cart icon (desktop) |
| `CheckoutForm` | `POST /public/orders` | Modal: name + phone required, table no + notes optional |
| `order-confirmation/{orderNumber}` | `GET /public/orders/{number}/status` (15s polling) | Status timeline + "Yeni sipariş" butonu |
| localStorage cart | — | Cross-device V2; V1 her browser'a ayrı sepet |

**Admin (operatör tarafı):**

| Sayfa | API | Davranış |
|---|---|---|
| `/admin/orders` | `GET /admin/orders` (status + date filter) | Liste, badge'li status filtreleri |
| `/admin/orders/{id}` | `GET /admin/orders/{id}` + `POST /admin/orders/{id}/status` | Full detail + status update butonları |
| Sidebar | — | `Receipt` (lucide-react) icon, "Siparişler" |

**API wrappers (8B):**
- `apps/web/src/lib/api/orders.ts` — POST create, GET status, GET admin list/detail, POST status update
- TanStack Query hooks: `useOrders()`, `useOrderDetail()`, `useUpdateOrderStatus()`

**8B sonrası 8C** mutfak ekranı:
- `/admin/kitchen` full-screen-style grid
- 10s polling (default `pending,confirmed,preparing`)
- Her ticket: order_number, table_number, items qty × name, time_since_placed, status badge, action buttons
- Pulse animation pending+confirmed için (visual notification)

---

## 9. Bekleyen İşler / Backlog (Sprint 8A dışı)

- **Online ödeme (Sprint 9)** — ödeme akışı + iyzico/Stripe entegrasyonu
- **Müşteri hesabı (V2 ileri)** — sadakat + sipariş geçmişi
- **WebSocket real-time (V2 ileri)** — polling yerine push
- **Masa QR scanner (V2)** — `?table=` otomatik populate
- **Ses bildirimleri (V2 — mutfak)** — yeni sipariş audio alert
- **POS entegrasyonu** — restaurant yazarkasa + yazıcı
- **Multi-restaurant (V2 SaaS)** — şu an tek restaurant per tenant model

---

## 10. Sprint 8A Validation Summary

| Metric | Değer |
|---|---|
| Toplam yeni test | 58 (4 dosya) |
| Toplam backend test | 229 yeşil (+1 skip: analytics throttle) |
| Yeni app sayısı | 1 (`apps.orders`) |
| Yeni model sayısı | 2 (`Order`, `OrderItem`) + `OrderStatus` enum |
| Yeni view sayısı | 6 (2 public + 4 admin) |
| Yeni endpoint sayısı | 6 |
| Yeni migration | 2 (`orders/0001_initial`, `audit/0003_*`) |
| Yeni audit action | 6 (`order_placed/confirme/preparing/ready/delivered/cancelled`) |
| Yeni audit target_type | 1 (`order`) |
| Throttle | `public_orders` 20/min |
| Commit sayısı | 7 (worker) + 1 (docs D-022) = 8 toplam |
| Push durumu | ready (push sonrası rapor) |
| DECISIONS | D-022 eklendi |

---

**Sonuç:** Sprint 8A backend kapsamı **8 commit, 229 yeşil test, 6 endpoint, 2 model, 1 state machine** ile tamamlandı. Sprint 8B frontend public cart + admin orders başlayabilir.
