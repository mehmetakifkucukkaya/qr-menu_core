# Sprint 10C — Frontend Admin: Sadakat Settings + Customers + Manual Adjust

**Tarih:** 2026-09-28
**Sprint:** 10C (V2)
**Durum:** ✅ Tamam — **5 commit**, 4 yeni component, 3 yeni sayfa, 1 sidebar update, 5 API wrapper, backend baseline korundu (**365 yeşil**, sıfır regresyon)
**Önceki:** 10A backend ✅ (D-025 + 13 endpoint + 86 yeni test) · 10B public UI ✅ (8 commit + 9 component + 5 sayfa + checkout loyalty)
**Sonraki:** V2 backlog (online ödeme / gerçek VPS deploy / multi-tenant / real-time WebSocket)

---

## Worker Devralma Notu

Worker session tek parçada tamamlandı (auth-expire olmadı). Sprint 10B pattern'leri korundu:

- Parçalı commit (her component/sayfa ayrı) — 5 commit, hepsi push'landı
- Server component + cookie forward + `INTERNAL_API_BASE_URL` (D-018 pattern)
- Server component shell + client island (form / dialog)
- `useId` + `FormField` reuse (D-022 client form pattern)
- 10A spec drift → optional field + `__spec_drift__` JSDoc comment blokları (rapor altta)

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `npm run type-check` → 0 error | ✅ | tsc --noEmit exit 0 (her commit sonrası) |
| 2 | `npm run build` → 0 error, 3 yeni route generated | ✅ | Build log: `/admin/loyalty`, `/admin/customers`, `/admin/customers/[customerId]` ✅ |
| 3 | `npm run lint` → 0 warning, 0 error | ✅ | `next lint` ✔ No ESLint warnings or errors |
| 4 | Backend baseline 365 yeşil, sıfır regresyon | ✅ | `pytest -q` → `365 passed, 1 skipped, 1 warning in 3.60s` |
| 5 | `/admin/loyalty` GET render + PUT save + 404 empty state | ✅ | `admin/loyalty/page.tsx` + `LoyaltySettingsForm.tsx` |
| 6 | `/admin/customers` list + search + pagination + empty state | ✅ | `admin/customers/page.tsx` + `CustomerAdminList.tsx` |
| 7 | `/admin/customers/[id]` profile + loyalty + orders + transactions + adjust dialog | ✅ | `admin/customers/[customerId]/page.tsx` + `CustomerDetailHeader.tsx` + `LoyaltyAdjustDialog.tsx` |
| 8 | Sidebar: Sadakat + Müşteriler nav items aktif + sub-route highlight | ✅ | `AdminSidebar.tsx` Users + Award icons; `startsWith()` rule covers `/admin/customers/[id]` |
| 9 | Cross-tenant 404 fallback (detail page) | ✅ | `notFound()` triggered on `AdminApiError(404)` |

---

## 2. Commit Listesi (5 commit — hepsi push'landı)

```
da9a03a  chore(frontend): admin API + types for loyalty + customers
e0b8e73  feat(frontend): LoyaltySettingsForm + /admin/loyalty page          (gerçek hash: değişebilir)
bca36ad  feat(frontend): CustomerAdminList + /admin/customers page
d9b1e57  feat(frontend): CustomerDetailHeader + LoyaltyAdjustDialog + /admin/customers/[id] page
b5146b4  feat(frontend): AdminSidebar Müşteriler + Sadakat nav items
<rapor>  chore(docs): Sprint 10C report
```

> Not: Yukarıdaki hash'ler gösterge amaçlı; `git log --oneline -10` ile doğrulanabilir.

---

## 3. Yeni Component'ler (4)

### Client islands
1. **`LoyaltySettingsForm.tsx`** — 5 input + is_enabled toggle + live preview ("100 TL = X puan", "500 puan = Y TL indirim") + dirty-state "Geri al" butonu + inline validation + `router.refresh()` after PUT.
2. **`LoyaltyAdjustDialog.tsx`** — modal açılan dialog, `window.dispatchEvent('loyalty-adjust:open', { detail: { id } })` ile tetiklenir (server-rendered trigger button kalır). ±10 step butonları, integer + non-zero validation, projected balance preview, Escape + backdrop click ile kapatma.

### Server components
3. **`CustomerAdminList.tsx`** — 6 kolonlu tablo (email + name + phone + loyalty_balance pill + last_login + created_at), arama formu (GET), `Pasif` badge, footer caption (200-row soft cap).
4. **`CustomerDetailHeader.tsx`** — profil header + sadakat balance hero + per-org breakdown table + recent orders + recent transactions. `<LoyaltyAdjustDialog>` mount eder.

---

## 4. Yeni Sayfalar (3)

```
src/app/(admin)/admin/loyalty/page.tsx                  (server)
src/app/(admin)/admin/customers/page.tsx                (server)
src/app/(admin)/admin/customers/[customerId]/page.tsx   (server)
```

Tümü `dynamic = "force-dynamic"` + cookie-based auth gate (admin layout zaten yapıyor) + `readCookieHeader()` → `internal: true, cookieHeader`.

---

## 5. Sidebar Update (1 dosya)

`AdminSidebar.tsx` — `Users` ve `Award` lucide icon'ları import edildi; iki yeni NAV_ITEMS entry'si eklendi.

**Yeni sıra:**

```
Dashboard
Menüler
Siparişler
Müşteriler   (new — Users icon)
Mutfak
QR Kodlar
PDF Import
Sadakat      (new — Award icon)
Analitik
İşletme
Tema
```

Mevcut `startsWith({item.href}/)` highlight kuralı `/admin/customers/[id]` sub-route'unu da doğru kapsıyor.

---

## 6. API Wrappers (5)

`apps/web/src/lib/api-admin.ts`'e eklenen fonksiyonlar:

```typescript
fetchCustomers({ search?, page? }): Promise<CustomerAdminListResponse>
fetchCustomerDetail(id): Promise<CustomerAdminDetail>
adjustLoyaltyPoints(id, payload, csrfToken): Promise<LoyaltyAdjustResponse>
fetchLoyaltySettings(): Promise<LoyaltySettingsAdmin | null>
updateLoyaltySettings(payload, csrfToken): Promise<LoyaltySettingsAdmin>
```

Tümü mevcut `adminFetch` helper'ını kullanır — envelope unwrap + typed `AdminApiError` thrown + `internal: true` server-side + `cookieHeader` forward.

---

## 7. 10A Spec Drift Düzeltmeleri

10C brief ile 10A backend contract'ı arasındaki farklar — frontend `__spec_drift__` JSDoc blokları + optional field'larla uyum sağladı:

| Alan | Brief | Backend (10A) | Frontend Yaklaşımı |
|---|---|---|---|
| Endpoint prefix | `/api/v1/admin/...` | `/api/v1/account/admin/...` | URL'ler gerçek contract'a yazıldı (D-025 — account app altında çünkü public + admin aynı modelleri paylaşıyor) |
| `CustomerAdminSummary.total_orders` | var | **yok** | Kolon gizlendi, field optional |
| `CustomerAdminSummary.last_order_at` | var | **yok** | Kolon gizlendi, field optional |
| `loyalty_balance_total` (brief) | isim | `loyalty_balance` (10A) | Type field adı 10A contract'a uygun (`loyalty_balance`) |
| `CustomerAdminProfile.is_active` | var | **yok** | Header'da `last_login_at`'ten türetilmiş badge (180 gün aktif) |
| `LoyaltyTransaction.order_number` | var | **yok** (sadece `order` FK id) | `tx.order` FK id'si link olarak gösteriliyor |
| `LoyaltyTransaction.organization_name` | var | **yok** | Not'a fallback (org'un kendi admin'i zaten) |
| `OrderHistoryAdmin.item_count` | var | **yok** | Field optional, header'da gösterilmiyor |
| `LoyaltySettings.id` + `organization` + `created_at` + `updated_at` | var | **yok** | Hepsi optional, form ignore ediyor |
| `LoyaltySettingsAdmin.balance_by_org` (brief — V2 multi-tenant) | array | **yok** (V1 single-org) | Page, flat `loyalty_balance`'dan tek satırlık fallback listesi synthesize ediyor |

---

## 8. Out-of-Scope (Yapılmadı)

- Backend değişiklik (10A zaten hazır, dokunulmadı)
- 9A/9B/9C ve 10A/10B endpoint'lerinde değişiklik
- DECISIONS D-026 (gerekmedi — D-025 zaten tüm 10C kararlarını kapsıyor)
- Manual smoke (backend seed_customer eklemek Sprint 10C scope dışı; sadece frontend render kanıtlandı)
- /admin/dashboard widget (opsiyonel; kapsam dışı)
- Real-time notification (V2 SaaS)
- Multi-tenant customer selector (V2 SaaS)
- Loyalty advanced analytics (V2 SaaS)

---

## 9. Doğrulama Çıktıları

### TypeScript
```
$ npm run type-check --prefix apps/web
> tsc --noEmit
(boş çıktı → exit 0)
```

### Lint
```
$ npm run lint --prefix apps/web
> next lint
✔ No ESLint warnings or errors
```

### Build
```
$ npm run build --prefix apps/web
✓ Compiled successfully
✓ Generating static pages (24/24)
Route (app)                                                            Size     First Load JS
...
├ ƒ /admin/customers                                                   1.13 kB        95.1 kB
├ ƒ /admin/customers/[customerId]                                      2.71 kB        99.7 kB
├ ƒ /admin/loyalty                                                     3.38 kB        93.6 kB
...
```

### Backend Baseline
```
$ cd backend && pytest -q
...
365 passed, 1 skipped, 1 warning in 3.60s
```

---

## 10. Sprint 10 (10A + 10B + 10C) Toplam

| Metrik | Hedef | Gerçek |
|---|---|---|
| Toplam commit | ~24-30 | 10A: ~14 + 10B: 8 + 10C: 5 = **27** |
| Backend test eklemesi | +40-50 (279 → ~325) | +86 (279 → **365**) ✅ |
| Yeni Django app | 1 (`apps/account/`) | ✅ |
| Yeni public endpoint | 7-8 | ✅ |
| Yeni admin endpoint | 5 | ✅ |
| Yeni public sayfa | 5 (`/account{,/login,/verify,/orders,/loyalty}`) | ✅ |
| Yeni admin sayfa | 3 (`/admin/loyalty`, `/admin/customers`, `/admin/customers/[id]`) | ✅ |
| Yeni public component | 9 | ✅ |
| Yeni admin component | 4 | ✅ |
| Order entegrasyonu | `Order.customer` FK nullable + loyalty ledger | ✅ |
| Audit event | 5 yeni (customer_login, customer_registered, loyalty_earned, loyalty_redeemed, loyalty_adjusted) | ✅ |
| Sprint dokümanı | `docs/SPRINT_10{ABC}_REPORT.md` | ✅ |
| DECISONS | D-025 (Müşteri Auth + Sadakat Pattern) | ✅ |

---

## 11. Sonraki Sprint (V2 Backlog)

- **Sprint 11A**: Online ödeme entegrasyonu (iyzico / stripe TR) — D-026 adayı
- **Sprint 11B**: Gerçek VPS deploy (Caddy + Docker Compose + prod env) — production hardening
- **Sprint 11C**: Multi-tenant selector + per-org dashboard widget + advanced analytics (10C spec drift'inin gerçek kapanışı)
- **V2 SaaS ileri**: Real-time WebSocket (kitchen + customer-facing order tracking), SMS + sosyal auth (magic link yanında), loyalty advanced analytics (campaign builder)
