# Sprint 5B-1b Report — Frontend QR Management UI

**Tarih:** 2026-09-26
**Sprint:** 5B-1b (frontend, ~45-60 dk)
**Önceki:** Sprint 5A backend (QR + media upload + analytics) + 5B-1a frontend (event tracking + ImageUpload) ✅
**Durum:** ✅ Tamamlandı, 6 frontend commit, build + lint + tsc temiz

## Amaç

İşletme sahibinin `/admin/qr-codes` altından QR oluşturup, indirip, etiketleyip pasife alabileceği tam bir operator flow. Backend (Sprint 5A) hazır; bu sprint sadece UI katmanı.

## Kabul Kriteri Checklist

| # | Kriter | Durum |
|---|---|---|
| 1 | `/admin/qr-codes` → list page render, sidebar link aktif | ✅ |
| 2 | `/admin/qr-codes/new` → form (label + menu + branch + table) → submit → 201 → redirect detail | ✅ |
| 3 | `/admin/qr-codes/{id}` → large QR preview PNG görünür | ✅ |
| 4 | Download butonu PNG dosyası indirir (`<a download="qr-{id}.png">`) | ✅ |
| 5 | Target URL display (monospace, click-through new tab) | ✅ |
| 6 | Edit page label değiştirme + is_active toggle çalışıyor | ✅ |
| 7 | Delete butonu + ConfirmDialog → soft delete (`is_active=False`) | ✅ |
| 8 | `/admin/qr-codes?qr=<id>` URL ile public'te QR scan tracking aktif (5B-1a entegrasyonu) | ✅ (5B-1a events.ts `getQrId()` zaten aktif) |
| 9 | `npm run build` + `npm run lint` + `npx tsc --noEmit` temiz | ✅ |
| 10 | Backend test 121 yeşil (değişiklik yok — sadece frontend) | ✅ (5A sonrası 117, sonra 4 image URL test eklendi = 121) |
| 11 | Commit'ler main'e push | ✅ |

## Oluşturulan / Değiştirilen Dosyalar

### Yeni dosyalar
- `apps/web/src/app/(admin)/admin/qr-codes/page.tsx` — list page (server component)
- `apps/web/src/app/(admin)/admin/qr-codes/new/page.tsx` — create wrapper (server component)
- `apps/web/src/app/(admin)/admin/qr-codes/[qrId]/page.tsx` — detail page (server component)
- `apps/web/src/app/(admin)/admin/qr-codes/[qrId]/edit/page.tsx` — edit wrapper (server component)
- `apps/web/src/app/(admin)/admin/qr-codes/[qrId]/DeleteQRButton.tsx` — delete client island with ConfirmDialog
- `apps/web/src/app/(admin)/_components/QrListItem.tsx` — table row (server-renderable)
- `apps/web/src/app/(admin)/_components/QrForm.tsx` — shared create + edit form (client)
- `apps/web/src/app/(admin)/_components/QrPreview.tsx` — preview + download (server-renderable)

### Değiştirilen dosyalar
- `apps/web/src/lib/api-admin.ts` — `fetchBranches` + `fetchQRCodes` + `fetchQRCode` + `createQRCode` + `updateQRCode` + `deleteQRCode` + `qrDownloadUrl` + `CreateQRPayload`/`UpdateQRPayload` exports
- `apps/web/src/types/admin.ts` — `AdminQRCode` + `QRRelatedSummary` interface
- `apps/web/src/app/(admin)/_components/AdminSidebar.tsx` — `QrCode` import + "QR Kodlar" nav item

## Doğrulama Komutları

### TypeScript
```bash
cd /Users/mehmetakif/projects/agency-qr-menu/apps/web
npx tsc --noEmit
# (no output — exit 0)
```

### ESLint
```bash
npm run lint
# ✔ No ESLint warnings or errors
```
> İlk çalıştırmada `new/page.tsx:105` `'QR'ın` ve `PNG'sini` için 2 react/no-unescaped-entities error verdi. `&apos;` ile escape edildi.

### Build
```bash
NEXT_TELEMETRY_DISABLED=1 npm run build
# ✓ Compiled successfully
# ✓ Generating static pages (12/12)
# Route (app)
# ...
# ├ ƒ /admin/qr-codes                                                    1.93 kB          99 kB
# ├ ƒ /admin/qr-codes/[qrId]                                             1.93 kB          99 kB
# ├ ƒ /admin/qr-codes/[qrId]/edit                                        2.58 kB          99.7 kB
# └ ƒ /admin/qr-codes/new                                                2.58 kB          99.7 kB
```

### Backend (Sprint 5A kapsamı dışı, sadece smoke)
```bash
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8000/api/v1/admin/qr-codes/
# HTTP 403  → auth-gated, route alive (beklenen)
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8000/api/v1/admin/branches/
# HTTP 403  → auth-gated, route alive (beklenen)
```

## Commit Listesi (6 commit)

```
6421613 feat(frontend): QR edit page (label + active toggle)
fe6f9f9 feat(frontend): QR detail page + preview + download
cb2a502 feat(frontend): QR create page (/admin/qr-codes/new) + shared QrForm
5bad23a feat(frontend): QR list page (/admin/qr-codes)
9ebaba0 feat(frontend): QR API wrappers + sidebar QR Kodlar link
c2ac1e9 chore(docs): Sprint 5B-1a report — frontend event tracking + ImageUpload multipart
```

## QR Lifecycle Demo Akışı (V1 — owner gözüyle)

1. **Login**: `admin@modern-cafe.local` → `/admin/dashboard`
2. **Navigate**: Sol menüden "QR Kodlar" (QrCode ikonu) → `/admin/qr-codes`
3. **Empty state**: "Henüz QR kodunuz yok" + "İlk QR kodu oluştur" CTA
4. **Create**: "Yeni QR Kod" butonu → `/admin/qr-codes/new` → form (label="Kasa Önü", menu="Ana Menü", branch boş, table_number="4") → Submit
5. **Detail redirect**: Otomatik `/admin/qr-codes/{id}` — büyük QR preview (`<img>` ile PNG yüklenir), download butonu (`qr-{id}.png`), metadata card
6. **Download**: "PNG indir" → browser save dialog → `qr-1.png` → masada yazdır
7. **Edit**: Header'dan "Düzenle" → `/admin/qr-codes/{id}/edit` → label="Kasa Önü (Dış)" + is_active=true → Save → detail'e dön
8. **Refresh list**: `/admin/qr-codes` → güncellenmiş label + "Yayında" badge
9. **Public scan**: Telefon kamerası QR'ı okur → `http://localhost:3000/m/modern-cafe?qr=1` → müşteri menüyü görür → `trackEvent("menu_view")` + `trackEvent("qr_open")` arka planda çalışır (5B-1a public event tracker entegrasyonu) → admin summary kartında "1 tarama" artışı görünür (Sprint 5B-2 dashboard)
10. **Delete**: Header'dan "Sil" → ConfirmDialog → "Evet, sil" → soft delete (`is_active=False`) → listeye dön → QR listeden kaybolur, scan_count historical analytics'te kalır

## Mimari Notlar (Operasyonel Görünüm)

### API Mimari
- **`fetchQRCodes`** envelope-tolerant: response `{data: {count, results, ...}, meta}` → `results` döndürür. List endpoint'leri (menus, branches) ile tutarlı.
- **`fetchQRCode`** detay: response `{data: {...}, meta}` → tek QR objesi döndürür.
- **`qrDownloadUrl`** helper: server-side route değil (RSC'de kullanılmıyor), sadece `<img src>` ve `<a href>` için absolute URL. Browser cookie auto-send (`SameSite=Lax` + same-site localhost).
- **`UpdateQRPayload` minimal**: sadece `label` + `table_number` + `is_active`. `menu_id`/`branch_id`/`organization_id` PATCH'te yok — hedef menü/şube değişikliği yeni QR oluşturmayı gerektirir (zaten yazdırılmış QR'lar geçersiz olur).

### Sayfa Yapısı (server component ağırlıklı)
- **List** → server: `fetchQRCodes` → tablo. Delete satırın içinde küçük client island.
- **Create/Edit** → server wrapper + client form. Server auth + lookups, client form state + submit.
- **Detail** → server: `fetchQRCode` → büyük preview + metadata. Delete header'da.

### Bileşen Paylaşımı
- `DeleteQRButton` — list + detail sayfasında paylaşılıyor (colocation: `[qrId]/DeleteQRButton.tsx`)
- `QrForm` — create + edit sayfasında paylaşılıyor (`mode` prop'suz; `qr` presence'a göre edit davranışı tetikleniyor)
- `QrPreview` — sadece detail sayfasında kullanılıyor ama generic yapıda (caption + id)
- `QrListItem` — sadece list sayfasında

### Yetkilendirme / Auth
- Tüm sayfalar `fetchCurrentUser({ internal: true, cookieHeader })` ile defence-in-depth auth check yapıyor (layout zaten yapıyor ama layout ile page arasında session expire olabilir)
- 401/403 → `/login?next=...` redirect
- Tenant isolation: backend tarafında `QRCode.objects.for_user(user)` — frontend hiçbir yerde `?organization_id=` göndermiyor

### Soft Delete UX
- DELETE 204 — backend `is_active=False` flip ediyor
- ConfirmDialog copy: "Bu QR kod pasif hale getirilir; tarama geçmişi analitik için korunur. Listeden kaldırılır..."
- Sonra list → refresh (router.refresh)

## Sprint 5B-2 (Analytics Dashboard) Hazırlık Notu

5B-1b'nin uzak akrabası:
- **`scan_count`** her QR satırında list ve detail'de görünüyor (`tabular-nums` ile formatlı)
- **QR open tracking** public menüde hazır (5B-1a events.ts `getQrId()`)
- Analytics overview endpoint'i (`/api/v1/admin/analytics/overview`) 5A'da hazır:
  - `today_views`, `week_views`, `month_views`
  - `event_counts.{menu_view, language_change, whatsapp_click, phone_click, qr_open}`
  - `language_distribution` (per-locale ratio)
  - `top_qr_codes` (QRCode.scan_count desc, limit 5)
  - `daily_views` (TruncDate series — Sprint 5B-2 SVG bar için)
- 5B-2 sırasında:
  - `lib/api-admin.ts`'e `fetchAnalyticsOverview(days=30)` wrapper eklenir
  - `/admin/analytics` sayfası + `AnalyticsDashboard` component
  - SVG bar chart (Recharts/Chart.js yok — basit SVG yeterli, V1 planı)
  - Sidebar'a "Analitik" nav item eklenir (5B-1b'de yok)
- **API call budget**: 5B-1b'de her sayfa başına max 3 fetch (admin summary layout'ta 1 + sayfa fetchMenus + fetchBranches + fetchQRCodes). 5B-2'de sayfa başına 1-2 ek fetch yeterli.

## Sprint 5B-1 Kapsam Dışı (sonraki worker'lara)

- **5B-2** — Analytics dashboard page + SVG charts
- **5B-3** — Public event tracker'dan toplanan olayların özet kartları (opsiyonel, summary altına eklenebilir)
- **Demo flow** — owner login → create QR → print → customer scan → scan_count dashboard'da görünür

## V1 Dışı (Yapılmadı, Yapılmayacak)

Çevrimiçi ödeme, sipariş, mutfak ekranı, garson çağırma, POS, rezervasyon, müşteri hesabı, sadakat, AI menü import, cloud storage (S3/R2), Recharts/Chart.js. Plan'da açıkça "V1 dışı" olarak işaretliydi.
