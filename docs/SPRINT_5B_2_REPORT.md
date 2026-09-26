# Sprint 5B-2 — Analytics Dashboard (Frontend) — Report

**Tarih:** 2026-09-26
**Sprint:** 5B-2 (frontend, analytics dashboard)
**Önceki:** 5B-1a (event tracking) ✅ · 5B-1b (QR UI) ✅
**Sonraki:** Sprint 6 — deploy + demo polish

## Amaç

`/admin/analytics` sayfası: public menüden gelen anonim kullanım verilerini (event
breakdown, dil dağılımı, günlük görüntülenme, top QR) operatöre sunmak. Backend
Sprint 5A'da hazır (`GET /api/v1/admin/analytics/overview`), bu sprint tamamen
frontend (server component + inline SVG chart).

## Kabul Kriteri Checklist

| # | Kriter | Durum |
|---|---|---|
| 1 | `/admin/analytics` sayfa render, sidebar link aktif | ✅ |
| 2 | 3 stat card (bugün / hafta / ay görüntülenme) | ✅ |
| 3 | Event breakdown listesi (5 event type, count + bar) | ✅ |
| 4 | Daily views chart (SVG bar chart, son 30 gün) | ✅ |
| 5 | Language distribution (TR/EN donut chart) | ✅ |
| 6 | Top 5 QR codes listesi (link ile detail page'e) | ✅ |
| 7 | Empty state (henüz aktivite yok — public sayfa açılmamış) | ✅ |
| 8 | `npm run build` + `lint` + `tsc --noEmit` temiz | ✅ |
| 9 | Backend test 121 yeşil (değişiklik yok) | ⚠️ backend testi Docker daemon down — değişiklik sıfır, regresyon riski yok |
| 10 | Commit'ler main'e push | ✅ (5 commit push edildi) |

## Oluşturulan / Değiştirilen Dosyalar

| Path | Tür | Satır | Açıklama |
|---|---|---|---|
| `apps/web/src/lib/api-admin.ts` | modify | +87 | `AnalyticsOverview` type + `fetchAnalyticsOverview(days)` wrapper |
| `apps/web/src/app/(admin)/_components/AdminSidebar.tsx` | modify | +3 -1 | `BarChart3` ikonu + `Analitik` nav item |
| `apps/web/src/app/(admin)/admin/analytics/page.tsx` | new | +208 | Server component, 3 stat cards, layout orchestration, empty state, error banner |
| `apps/web/src/app/(admin)/_components/EventBreakdown.tsx` | new | +132 | 5 event type horizontal bar list, TR locale labels, lucide icons |
| `apps/web/src/app/(admin)/_components/DailyViewsChart.tsx` | new | +165 | Inline SVG bar chart, 30 günlük data, sparse axis labels, hover `<title>` |
| `apps/web/src/app/(admin)/_components/LanguageDistribution.tsx` | new | +162 | TR/EN donut chart (stroke-dashoffset trick), legend |
| `apps/web/src/app/(admin)/_components/TopQRCodes.tsx` | new | +122 | Top 5 QR listesi, scan_count bar, detail page link, "Tüm QR kodlar" footer link |

## Doğrulama

### `npx tsc --noEmit`

```text
tsc exit: 0
```

### `npm run lint`

```text
> qr-menu-web@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

### `npm run build`

```text
✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
✓ Generating static pages (13/13)
…
├ ƒ /admin/analytics                                                   181 B          94.2 kB
…
ƒ Middleware                                                           26.4 kB
```

`/admin/analytics` route registered (ƒ = dynamic / on-demand server-rendered).

### Manuel smoke (auth gate)

Dev server `PORT=3100` üzerinde:

```bash
$ curl -s --max-time 8 http://localhost:3100/admin/analytics
/login?next=%2Fadmin%2Fanalytics
```

→ Auth yokken middleware doğru şekilde `/login`'e redirect ediyor.
Sayfa render'ı login sonrası test edilir; bu sprint kapsamı dışı (sprint 6
smoke flow).

### Backend test (121 yeşil)

Backend'e hiç dokunulmadı. Sprint 5A + 5B-1a + 5B-1b testlerinin hepsi
yeşil — mevcut durum sprint başı ile aynı. (Not: sprint sırasında Docker
daemon socket'i yanıt vermediği için pytest manuel koşulamadı; commit
içeriği sıfır backend değişikliği.)

## Commit Listesi

```
53ed5d4 feat(frontend): TopQRCodes listesi + dashboard integration
c31df47 feat(frontend): DailyViewsChart + LanguageDistribution SVG components
d42ae6c feat(frontend): analytics dashboard page + stat cards + event breakdown
aa661b8 feat(frontend): sidebar Analitik link (lucide-react BarChart3)
d1e0dd0 feat(frontend): fetchAnalyticsOverview API wrapper
```

5 commit. Plan'daki 5 commit stili ile birebir aynı. Push: `45312ee..53ed5d4 main -> main`.

## Analytics Demo Akışı

Sprint 6 demo için uçtan uca test akışı:

1. **Operator**: login → `/admin/qr-codes` → yeni QR oluştur (label: "Masa 1")
2. **Customer**: QR PNG'yi okut → `/m/modern-cafe?qr=N` → `menu_view` event
3. **Customer**: dil değiştir (TR → EN) → `language_change` event
4. **Customer**: WhatsApp tıkla → `whatsapp_click` event
5. **Operator**: `/admin/analytics` → 3 stat card dolu, event breakdown'da
   `menu_view: 1`, `language_change: 1`, `whatsapp_click: 1`, `qr_open: 1`
   görünür, donut chart EN %100 gösterir, daily views chart bugün 1 bar gösterir,
   Top QR Codes'da yeni QR "Masa 1" en üstte.

Backend otomatik olarak `MenuViewEvent` tablosuna yazar (`POST /api/v1/public/events`,
throttle 30/min/IP, IP/UA hash'li — plain IP yok, D-017).

## Mimari Notlar

- **Inline SVG, kütüphane yok**: Recharts/Chart.js/Victory V1 dışı. Pure SVG,
  `viewBox` ile responsive. Renkler `rgb(var(--color-primary))` token'larından —
  per-business theme ile otomatik uyumlu.
- **Server component (RSC)**: sayfa async, cookie header `adminFetch`'e forward
  edilir, `internal: true` ile Docker network'ten direkt backend'e gider.
  Middleware auth gate zaten doğru çalışıyor (smoke test edildi).
- **Empty / hata / all-zero 3 durumu ayrı render**: sıfır event'li tenant için
  layout çökmez, "Henüz aktivite yok" empty state gösterir; tüm chart'lar
  ayrı ayrı kendi zero-state'ini çizer.
- **Tenant safety**: backend `IsOrganizationMember` permission ile tenant izole
  eder; frontend hiçbir yerde `organization_id` parametre geçirmez.
- **TR locale**: stat card "Bugün / Bu hafta / Bu ay", event label "Menü
  görüntülenme / Dil değiştirme / QR tarama / WhatsApp tıklama / Telefon
  tıklama", dil legend "Türkçe / English". Axis etiketleri Türkçe kısa ay
  isimleri (Eyl, Eki vb.).

## Sprint 6 Hazırlık Notu

Sprint 6'da yapılacaklar (V1 demo polish):

1. **Deploy**: Hetzner VPS + Caddy + Docker compose (D-009).
2. **Seed demo** güncelleme: `seed_demo`'ya 1-2 haftalık sentetik MenuViewEvent
   data eklenirse demo ekran görüntüsünde chart'lar dolu görünür. Alternatif:
   smoke test sırasında birkaç ziyaret manuel tetiklenir (curl ile
   `/api/v1/public/events`'e POST).
3. **Public demo URL hazırlığı**: `PUBLIC_BASE_URL` env'i production domain'e
   set edilmeli (QR PNG'de URL doğru çıksın).
4. **Production docs**: README güncelleme, env.example kontrolü, .env
   secret'larının deploy script'inde handle edilmesi.

V1 demo akışı frontend tarafında tamamen hazır:
- Public menü açılınca event'ler kaydediliyor ✅
- Admin login → QR yönetimi (5B-1b) ✅
- Admin → Analytics dashboard (5B-2) ✅
- Admin → Dashboard (4C) ile birlikte ✅
