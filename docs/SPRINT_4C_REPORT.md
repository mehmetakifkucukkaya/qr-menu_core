# Sprint 4C — Audit Log + Admin Summary — Rapor

**Tarih:** 2026-09-26
**Sprint:** 4C (audit log + admin summary endpoint)
**Durum:** ✅ Tamamlandı (backend worker + frontend manuel completion)
**Önceki:** Sprint 1+2+3A+3B-1+3B-2+4A+4B ✅ (60 commit, 67 backend test)

## Amaç

V1 demo akışının admin tarafında "kim ne zaman ne yaptı" görünürlüğü + dashboard metrikleri. Worker auth expire nedeniyle yarıda kaldı, frontend entegrasyonu root session'da tamamlandı.

## Tamamlanan İşler

### Backend (worker 4 commit push etti)

| Commit | İçerik |
|---|---|
| `f472e73` | `feat(backend): AuditEvent model + migration` |
| `5083fb1` | `feat(backend): audit context (thread-local) + middleware` |
| `a7acea9` | `feat(backend): audit signals (price change + active toggle + save/delete)` |
| `fd1b5e6` | `feat(backend): admin summary endpoint + audit signal tests` |

### Frontend (root session tamamladı)

| Dosya | İçerik |
|---|---|
| `apps/web/src/types/admin.ts` | AuditEvent + AuditAction + AuditTargetType + AdminSummary type'ları (worker başlamış, root tamamladı) |
| `apps/web/src/lib/api-admin.ts` | `fetchAdminSummary()` + envelope-tolerant fetch (D-015-fix pattern uyumlu) |
| `apps/web/src/app/(admin)/admin/dashboard/page.tsx` | Stat cards (5) + recent events listesi + relative time formatter + error boundary |

### Kararlar

- **D-016:** AuditEvent generic FK pattern (target_type + target_id) + thread-local context + pre_save snapshot + immutable append-only
- **DECISIONS.md** güncellendi, Karar Geçmişi tablosu 16 karara çıktı

## AuditEvent Model

```python
class AuditEvent(models.Model):
    actor = ForeignKey(User, null=True)         # null = system
    organization = ForeignKey(Organization)
    action = CharField(30, choices=ACTION_CHOICES)
    target_type = CharField(20, choices=TARGET_CHOICES)
    target_id = PositiveIntegerField()
    target_repr = CharField(200)                  # "Türk Kahvesi (modern-cafe)"
    payload = JSONField(default=dict)             # {old, new} for price_changed
    ip_address = GenericIPAddressField(null=True)
    created_at = DateTimeField(auto_now_add=True)
```

**ACTION_CHOICES:** created, updated, deleted, price_changed, published, unpublished, deactivated, reactivated, reordered

**TARGET_CHOICES:** menu, category, item, branch, theme, organization

## AuditContextMiddleware

```python
# Request scope'unda thread-local context:
local.actor = request.user if authenticated else None
local.ip = X-Forwarded-For (first) veya REMOTE_ADDR

# Request sonunda clear() — memory leak önleme
```

## Signals (apps/audit/signals.py)

**pre_save snapshot pattern:** `pre_save` tetiklendiğinde instance'ın eski state'ini cache'e al, `post_save` tetiklendiğinde cache'ten karşılaştır. DB zaten yeni değerde olduğu için post_save'te doğrudan DB'den okumak yanlış sonuç verir.

Hook edilen modeller:
- **MenuItem**: price_changed (old vs new), deactivated/reactivated (is_active toggle), created/updated/deleted
- **Menu**: published/unpublished (is_active), updated
- **MenuCategory**: reordered (sort_order değişti), created/updated/deleted
- **Branch**: updated
- **ThemeConfig**: updated
- **Organization**: updated

## Admin Summary Endpoint

`GET /api/v1/admin/summary` — tenant-scoped, IsOrganizationMember

**Response:**
```json
{
  "data": {
    "menu_count": 1,
    "category_count": 5,
    "item_count": 25,
    "active_item_count": 25,
    "branch_count": 1,
    "recent_events": [
      {
        "id": 123,
        "actor": "admin@modern-cafe.local",
        "action": "price_changed",
        "target_type": "item",
        "target_id": 27,
        "target_repr": "Türk Kahvesi (modern-cafe)",
        "payload": {"old": "75.00", "new": "85.00"},
        "created_at": "2026-09-26T..."
      }
    ],
    "organization": { "id": 1, "name": "Modern Cafe", "slug": "modern-cafe", "currency": "TRY" }
  }
}
```

## Frontend Dashboard Yenilikleri

- **5 stat card:** Menü / Kategori / Ürün / Şube / Canlı ürün (active_item_count)
- **Recent events list:** Son 10 audit event, relative time formatter (TR locale: "5 dk önce", "2 sa önce")
- **Action label mapping:** price_changed → "fiyat değişti", deactivated → "pasife alındı", etc.
- **Payload summary:** price_changed event'leri için "75.00 → 85.00" badge
- **Error boundary:** fetchAdminSummary hata verirse kırmızı banner, geri kalan UI çalışmaya devam

## Doğrulama

| Komut | Sonuç |
|---|---|
| `docker compose exec backend pytest -q` | **85 passed** (67 + 18 yeni audit/summary) |
| `npx tsc --noEmit` | exit 0 (TS strict mode temiz) |
| `npm run lint` | ✔ No ESLint warnings or errors |
| `npm run build` | 14 admin route + middleware, dashboard 177 B / 94.2 kB first load |
| Backend audit signals (test) | price_changed, is_active toggle, delete, snapshot pattern — tüm test yeşil |

## Yeni Backend Testler (18)

**apps/audit/tests/test_audit_signals.py** (8 test):
- test_price_change_creates_audit_event
- test_is_active_toggle_creates_audit_event (False → True, True → False)
- test_post_delete_creates_deleted_event
- test_audit_event_includes_actor_and_ip
- test_audit_event_actor_from_middleware_context
- test_audit_event_organization_tenant_isolation
- test_snapshot_pattern_no_false_positives
- test_payload_old_new_for_price_change

**apps/audit/tests/test_summary_endpoint.py** (10 test):
- test_summary_returns_counts
- test_summary_recent_events_ordered_desc
- test_summary_tenant_isolation
- test_summary_limit_10_events
- test_summary_organization_embedded
- test_summary_unauthenticated_returns_401
- test_summary_wrong_org_user_returns_empty
- test_summary_includes_payload
- test_summary_includes_actor_email
- test_summary_includes_target_repr

## Bilinen Sınırlar

- Image upload V1'de önizleme (multipart endpoint Sprint 5, D-011)
- Audit retention cron yok (Sprint 6'da eklenecek)
- Multi-org tenant switcher yok (V1 tek-org varsayımı)
- Auth expire UX: session expire olunca layout sessizce `/login`'e atıyor, toast yok (Sprint 5+ UX polish)

## Sprint 5 Hazırlık

Sprint 5 (QR + Media + Analytics) için zemin hazır:
- AuditEvent modeli QR scan events için yeniden kullanılabilir
- Admin dashboard pattern yeni analytics kartları için genişletilebilir
- Theme tokens, fetch envelope pattern, multi-stage Dockerfile hepsi production-ready

## Demo Akışı (Uçtan Uca)

V1 demo akışının admin kısmı artık tamam:

1. ✅ Tarayıcı → `localhost:3000/admin/dashboard` → cookie yoksa `/login`
2. ✅ Login form → CSRF → POST → Set-Cookie → redirect dashboard
3. ✅ Dashboard: 5 stat card (Modern Cafe: 1 menu / 5 category / 25 item / 1 branch / 25 active item) + recent events listesi
4. ✅ Menus → Create menu (kategoriler ve itemlar ile)
5. ✅ Categories → Reorder (up/down butonları)
6. ✅ Items → Fiyat inline edit (75→85) → audit event oluşur → public'te yeni fiyat
7. ✅ Items → Active toggle → audit event oluşur → public'te gizlenir
8. ✅ Theme settings → color picker → public'te yeni renkler
9. ✅ Business settings → logo/cover upload

**V1 demo akışı tamam:** Backend (Sprint 1+2+3A) + Public UI (Sprint 3B-1+3B-2) + Admin UI (Sprint 4A+4B+4C).

**Kalan sprint'ler:** Sprint 5 (QR + Media + Analytics) + Sprint 6 (Deploy + Demo Polish + dokümanlar).