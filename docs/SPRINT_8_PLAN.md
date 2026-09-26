# Sprint 8 — Masa Siparişi + Mutfak Ekranı (V2 Second Sprint) — Detaylı Plan

**Tarih:** 2026-09-26
**Sprint:** 8 (V2 second sprint, 3-4 gün, planlanan ~80-120 saat)
**Durum:** Planlandı → 8A (backend) worker başlatılacak, 8B (frontend public+admin sipariş) + 8C (mutfak ekranı) sonra
**Önceki:** V1 + V2 Sprint 7 (AI PDF Import) ✅ tamam — 123 commit, 171 backend test

## Amaç

Müşteri public menüden ürünleri sepete ekler, sipariş verir. Admin/operatör siparişi onaylar, mutfak ekranında ticket belirir, hazır olunca müşteriye bildirilir. POS entegrasyonu olmadan V1 seviyesinde.

**V2 demo akışı:**
1. Müşteri: `/m/modern-cafe` → ürün kartı → "Sepete ekle" → floating cart → "Sipariş Ver"
2. Public → admin'e sipariş bildirimi (polling)
3. Admin: `/admin/orders` → sipariş detay → "Onayla" → "Hazırlanıyor"
4. Mutfak: `/admin/kitchen` → büyük ticket listesi → sipariş durumu güncelle
5. Müşteri: sipariş durumu polling ile görür ("Hazır!")
6. Admin: "Teslim Edildi" → sipariş kapanır

## Açık Kararlar (Sprint 8 başında netleşecek)

| ID | Karar | Öneri | Gerekçe |
|---|---|---|---|
| **OP-18** | Customer auth | Telefon + isim yeterli (V1). Hesap V2 ileri. | V1 demo hızlı onboarding, friction az; V2'de müşteri hesabı + sadakat eklenecek |
| **OP-19** | Basket persistence | localStorage (V1). Server-side cart V2 ileri. | Cross-device sync V2 özelliği |
| **OP-20** | Real-time notification | Polling 15s (V1). WebSocket V2 ileri. | V1 için polling yeterli, < 30s gecikme kabul edilebilir |
| **OP-21** | Ödeme entegrasyonu | Sprint 9'da (V2 sprint 8 sonrası). V1'de ödeme yok. | Gelir modeli, ancak sipariş akışı önce |
| **OP-22** | Masa numarası | Opsiyonel (V1). QR table_number zaten var. | V2 ileri: zorunlu + masa seçim UI |
| **OP-23** | Sipariş iptal | Admin panel'den `cancelled` status. | V2 ileri: müşteri kendisi iptal edebilir |

## Sprint 8 Parçaları

### Sprint 8A — Backend (sipariş + mutfak, ~60-75 dk)

**Kapsam:**
- `apps/orders/` — yeni app
- Order + OrderItem modelleri
- Order status enum + transition rules
- Public sipariş endpoint (POST /api/v1/public/orders)
- Public sipariş durum endpoint (GET /api/v1/public/orders/{order_number}/status)
- Admin sipariş endpoints (list, detail, status update)
- Mutfak ekranı endpoint (GET /api/v1/admin/kitchen/tickets)
- Order number generator (human-readable: `MC-20260115-001`)
- Total amount calculation
- Tenant isolation
- Audit events (order_placed, order_confirmed, order_preparing, order_ready, order_delivered, order_cancelled)
- ~20 backend test

### Sprint 8B — Frontend (public sepete ekle + admin sipariş, ~45-60 dk)

**Kapsam:**
- Public sayfa: her item'a "Sepete ekle" butonu + quantity selector
- Floating cart drawer (sağ alt)
- Sepet modal: items, total, müşteri bilgisi (telefon + isim), masa no, notlar
- Sipariş ver → confirmation page (sipariş no + polling status)
- Sipariş durumu polling (15s)
- Admin: `/admin/orders` list + detail + status update
- API wrappers
- Sidebar Orders link

### Sprint 8C — Frontend (mutfak ekranı, ~30-45 dk)

**Kapsam:**
- `/admin/kitchen` — fullscreen-style büyük ticket listesi
- Polling 10s (daha sık)
- Status update butonları (Confirm / Preparing / Ready / Delivered)
- "Yeni sipariş" ses bildirimi (V2 ileri — V1'de visual indicator)
- Public menüdeki gibi Modern Cafe palette + theme tokens

## Backend Detay (Sprint 8A)

### Domain Model

```python
# apps/orders/models.py

class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Beklemede (müşteri gönderdi)'),
        ('confirmed', 'Onaylandı (admin kabul etti)'),
        ('preparing', 'Hazırlanıyor (mutfak)'),
        ('ready', 'Hazır (müşteriye bildirildi)'),
        ('delivered', 'Teslim Edildi'),
        ('cancelled', 'İptal Edildi'),
    ]

    order_number = CharField(max 30, unique=True, db_index=True)  # MC-20260115-001
    organization = FK(Organization, related_name='orders')
    branch = FK(Branch, null=True, related_name='orders')
    menu = FK(Menu, null=True, related_name='orders')
    table_number = CharField(max 20, blank=True)
    customer_name = CharField(max 80)
    customer_phone = CharField(max 20)
    notes = TextField(blank=True)
    status = CharField(choices=STATUS_CHOICES, default='pending', db_index=True)
    total_amount = DecimalField(max_digits=10, decimal_places=2)
    currency = CharField(max 3, default='TRY')
    placed_at = DateTimeField(auto_now_add=True, db_index=True)
    confirmed_at = DateTimeField(null=True)
    preparing_at = DateTimeField(null=True)
    ready_at = DateTimeField(null=True)
    delivered_at = DateTimeField(null=True)
    cancelled_at = DateTimeField(null=True)
    metadata = JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-placed_at']

class OrderItem(models.Model):
    order = FK(Order, related_name='items')
    menu_item = FK(MenuItem, null=True)  # nullable: item silinse bile order item kalır
    name = CharField(max 120)  # snapshot
    price = DecimalField(max_digits=10, decimal_places=2)  # snapshot
    quantity = PositiveIntegerField()
    notes = CharField(max 200, blank=True)

    class Meta:
        ordering = ['id']
```

### Status Transition

```python
STATUS_TRANSITIONS = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['preparing', 'cancelled'],
    'preparing': ['ready', 'cancelled'],
    'ready': ['delivered'],
    'delivered': [],  # terminal
    'cancelled': [],  # terminal
}
```

### Order Number Generator

```python
def generate_order_number(organization):
    """MC-20260115-001 formatında, günlük artan."""
    today = timezone.now().strftime('%Y%m%d')
    prefix = f"{organization.slug[:2].upper()}-{today}-"
    today_orders = Order.objects.filter(
        organization=organization,
        order_number__startswith=prefix,
    ).count()
    return f"{prefix}{today_orders + 1:03d}"
```

### Backend Endpoints

```
Public (no auth):
  POST /api/v1/public/orders
    Body: {
      organization_slug: 'modern-cafe',
      branch_slug: 'merkez' (optional),
      table_number: '4' (optional),
      customer_name: 'Mehmet',
      customer_phone: '+90 532 555 0123',
      notes: 'Az şekerli' (optional),
      items: [
        { menu_item_id: 27, quantity: 2, notes: 'Sıcak' },
        { menu_item_id: 31, quantity: 1 },
      ],
    }
    Response: 201 {
      data: {
        order_number: 'MC-20260115-001',
        status: 'pending',
        total_amount: '105.00',
        currency: 'TRY',
        placed_at: '2026-01-15T10:30:00Z',
      }
    }

  GET /api/v1/public/orders/{order_number}/status
    Response: 200 {
      data: {
        order_number: 'MC-20260115-001',
        status: 'preparing',
        placed_at: '...',
        confirmed_at: '...',
        preparing_at: '...',
      }
    }

Admin (IsOrganizationMember + IsAuthenticated):
  GET /api/v1/admin/orders
    Query: ?status=pending&date=2026-01-15
    Response: 200 { data: [orders] }

  GET /api/v1/admin/orders/{id}
    Response: 200 { data: { order + items } }

  POST /api/v1/admin/orders/{id}/status
    Body: { status: 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled' }
    Response: 200 { data: { order } }
    Side effect: Audit event + status timestamp

  GET /api/v1/admin/kitchen/tickets
    Query: ?status=confirmed,preparing
    Response: 200 { data: [orders with items + branch_name + table_number + time_since_placed] }
```

### Total Amount Calculation

```python
def calculate_total(items_data):
    """Server-side total calculation (client's price ignored)."""
    total = Decimal('0')
    for item in items_data:
        menu_item = MenuItem.objects.get(pk=item['menu_item_id'])
        if not menu_item.is_available:
            raise ValidationError(f"{menu_item.name} tükenmiş.")
        total += menu_item.price * item['quantity']
    return total
```

### Audit Events

```python
# AuditEvent.action choices:
'order_placed' (customer public POST)
'order_confirmed' (admin status update)
'order_preparing'
'order_ready'
'order_delivered'
'order_cancelled'
```

### Tests (~20 test)

```
apps/orders/tests/test_order_creation.py:
  - test_order_creation_with_valid_items
  - test_order_creation_validates_menu_item_availability
  - test_order_creation_calculates_total_from_db_prices
  - test_order_creation_generates_unique_order_number
  - test_order_creation_with_table_number
  - test_order_creation_with_customer_notes

apps/orders/tests/test_status_transitions.py:
  - test_status_transition_pending_to_confirmed
  - test_status_transition_confirmed_to_preparing
  - test_status_transition_preparing_to_ready
  - test_status_transition_ready_to_delivered
  - test_status_invalid_transition_rejected (e.g. pending -> delivered)
  - test_status_terminal_states_cannot_change (delivered, cancelled)

apps/orders/tests/test_views.py:
  - test_public_post_creates_order
  - test_public_post_unknown_org_returns_404
  - test_public_get_status_returns_200
  - test_admin_list_tenant_scoped
  - test_admin_status_update_records_audit_event
  - test_kitchen_tickets_filters_by_status

apps/orders/tests/test_security.py:
  - test_public_post_no_auth_required
  - test_admin_status_update_requires_authentication
  - test_order_number_unique_constraint
```

## Frontend Detay (Sprint 8B + 8C)

### Public Sepete Ekle + Sipariş Ver

`apps/web/src/components/public/ItemCard.tsx` güncelle — "+ Sepete ekle" butonu + quantity selector.

`apps/web/src/components/public/CartDrawer.tsx` — floating bottom-right (mobile) veya header cart icon (desktop):
- Items list (image, name, qty, price)
- Subtotal + total
- "Sipariş Ver" → modal

`apps/web/src/components/public/CheckoutForm.tsx` — modal:
- Müşteri adı + telefon (required)
- Masa no (optional, prefilled from QR ?table=N)
- Notlar (optional)
- "Onayla" → POST /public/orders → redirect confirmation

`apps/web/src/app/(public)/m/[businessSlug]/order-confirmation/[orderNumber]/page.tsx`:
- Order summary
- Status polling (15s)
- "Yeni sipariş ver" butonu

### Admin Orders

`apps/web/src/app/(admin)/admin/orders/page.tsx` — list
`apps/web/src/app/(admin)/admin/orders/[orderId]/page.tsx` — detail + status update butonları

Sidebar: `Orders` nav item + lucide-react `Receipt` ikonu

### Mutfak Ekranı

`apps/web/src/app/(admin)/admin/kitchen/page.tsx`:
- Full-width grid (3-4 kolon desktop, 1-2 kolon mobile)
- Her ticket kartı:
  - Order number (büyük)
  - Masa no (büyük)
  - Items list (qty × name + notes)
  - Time since placed (mm:ss)
  - Status badge
  - Action buttons (Confirm / Preparing / Ready / Delivered)
- Polling 10s
- Pending/confirmed kartları için subtle pulse animation

## V1 Dışı (YAPMA)

Online ödeme (Sprint 9), müşteri hesabı (V2 ileri), sadakat puanı, POS entegrasyonu, multi-restaurant, real-time WebSocket (V2 ileri), ses bildirimleri, table QR scanner, masa oturma yönetimi, sipariş iptal email/SMS, mutfak performans analytics, garson çağırma, envanter takibi.

## Commit Stili (~12-15 commit, toplam Sprint 8)

**Sprint 8A (~6-8 commit):**
- `chore(backend): orders app scaffold + INSTALLED_APPS`
- `feat(orders): Order + OrderItem models + migration`
- `feat(orders): order number generator service`
- `feat(orders): public POST /orders endpoint + validation`
- `feat(orders): public GET /orders/{number}/status endpoint`
- `feat(orders): admin orders list/detail/status endpoints`
- `feat(orders): kitchen tickets endpoint + filters`
- `feat(orders): audit events integration (6 new action)`
- `test(backend): orders tests (~20 test, mocked DB)`
- `chore(docs): DECISIONS D-022 (order model + status flow)`

**Sprint 8B (~5-6 commit):**
- `feat(frontend): cart store (Zustand) + localStorage persist`
- `feat(frontend): CartDrawer + ItemCard quantity controls`
- `feat(frontend): CheckoutForm modal + customer info`
- `feat(frontend): order confirmation page + status polling`
- `feat(frontend): admin orders list + detail + status buttons`
- `chore(docs): Sprint 8B report`

**Sprint 8C (~2-3 commit):**
- `feat(frontend): kitchen display page + polling`
- `feat(frontend): kitchen ticket card + status buttons + pulse animation`
- `chore(docs): Sprint 8C report`

## Kabul Kriterleri (Toplam Sprint 8)

### Backend (8A)
✅ POST /api/v1/public/orders (validation, total calculation, order number, audit event)
✅ GET /api/v1/public/orders/{number}/status
✅ GET /api/v1/admin/orders (list + filter)
✅ GET /api/v1/admin/orders/{id}
✅ POST /api/v1/admin/orders/{id}/status (transition validation)
✅ GET /api/v1/admin/kitchen/tickets (status filter)
✅ Tenant isolation (org A user org B orders göremez)
✅ pytest 171 + 20 = 191 yeşil
✅ Audit events (order_placed, order_confirmed, order_preparing, order_ready, order_delivered, order_cancelled)
✅ Order number unique + format (slug-YYYYMMDD-NNN)

### Frontend (8B + 8C)
✅ Public: ItemCard "Sepete ekle" + quantity selector
✅ Public: CartDrawer floating + items list + subtotal
✅ Public: CheckoutForm modal + customer info validation
✅ Public: Confirmation page + 15s polling
✅ Admin: `/admin/orders` list + filters (status, date)
✅ Admin: Order detail + status update buttons
✅ Admin: `/admin/kitchen` fullscreen-style grid + 10s polling
✅ Sidebar Orders + Kitchen nav items
✅ npm run build + lint + tsc temiz

### Genel
✅ DECISIONS D-022 (order model + status flow + V1 customer info yeterli)
✅ Commit'ler main'e push
✅ V1 demo akışının sipariş versiyonu uçtan uca çalışır

## Auth Expire Riski

8A backend büyük scope (~60-75 dk). 90 dakika kuralı.

Tamamlanmazsa scope'u daralt:
- Öncelik 1: Order + OrderItem models + public POST endpoint + validation
- Öncelik 2: Admin status update + kitchen tickets
- Öncelik 3: Total amount service + audit events

8B frontend ~45-60 dk. 8C ~30-45 dk. Auth expire olursa parçalanır.

## Notlar

- Order number format: `{slug2}-{YYYYMMDD}-{NNN}` — slug 2 char prefix (modern cafe → MC)
- Total amount server-side hesaplanır (client'ın gönderdiği fiyat YOK sayılır) — güvenlik
- Menu item availability check (is_available=False → 400)
- Sipariş sonrası menu_item değişse bile OrderItem snapshot korur (name + price)
- Basket localStorage persist (cross-device V2 ileri)
- Status polling 15s public, 10s kitchen (daha sık tazeleme)
- V2 demo: müşteri QR'dan sipariş → admin onaylar → mutfak hazırlar → müşteri "Hazır!" görür
- 8A sonunda 8B başlayacak, 8B sonunda 8C mutfak ekranı
- 8 tamamlandığında V2'de sipariş + operasyon hazır, ödeme Sprint 9'da