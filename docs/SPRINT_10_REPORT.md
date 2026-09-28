# Sprint 10 — Müşteri Hesabı + Sadakat Puanı (V2 Dördüncü Feature — Tamamlandı)

**Tarih:** 2026-09-28
**Sprint:** 10 (V2) → 10A (backend) ✅ + 10B (public UI) ✅ + 10C (admin UI) ✅
**Durum:** ✅ **Tamam** — toplam ~28 commit (10A 14 + 10B 8 + 10C 6), backend **279 → 365 yeşil** (+86: 22 auth + 18 loyalty + 31 views + 15 security), tsc + lint + build tüm alt sprint'lerde temiz
**Önceki:** 9 (AI çeviri + açıklama + SEO) ✅, 8 (sipariş + mutfak) ✅, 7 (PDF import) ✅
**Karar Geçmişi:** +1 (D-025 Müşteri Auth + Sadakat Puanı Pattern)
**Sonraki:** V2 backlog — Online Ödeme / Gerçek VPS Deploy / Multi-Tenant Tenant Switcher

## Özet

Sprint 10, V2'nin dördüncü büyük feature'ı olan **Müşteri Hesabı + Sadakat Puanı**'nı uçtan uca ship etti. Müşteri artık email + magic link ile giriş yapabilir, sipariş geçmişini görür, sadakat puanı kazanır/harcayabilir. Operatör `/admin/loyalty` üzerinden puan oranını ayarlar, `/admin/customers` üzerinden tüm müşterileri görür, manuel puan adjust edebilir.

| Persona | Akış | Sprint |
|---|---|---|
| **Müşteri (guest)** | QR menü → sepete ekler → misafir checkout (telefon+isim, önceki gibi) | korunur |
| **Müşteri (yeni)** | `/account/login` → email → magic link tıklar → session açılır | 10B |
| **Müşteri (auth)** | CheckoutForm LoyaltyRedeemCheckbox → "100 puan kullan → 10 TL indirim" → sipariş oluştur | 10B |
| **Müşteri (post-purchase)** | Sipariş delivered → 1 TL = 1 puan otomatik kazanılır (FSM atomic) | 10A |
| **Müşteri (geri)** | `/account` dashboard → sipariş history + sadakat bakiyesi + ledger | 10B |
| **Operatör** | `/admin/loyalty` → puan oranı / redemption rate / min threshold config | 10C |
| **Operatör** | `/admin/customers` → tüm müşteriler + arama + detay | 10C |
| **Operatör** | `/admin/customers/{id}` → Manuel puan +N / -N → audit | 10C |

**Test state:** Backend 229 baseline → 229 (Sprint 9) → 279 (Sprint 9A) → **365 yeşil** (+86 Sprint 10A; 0 regresyon). Frontend 20 SEO (Sprint 9C) → Sprint 10B/10C ek test yok (frontend-only sprint'ler, pre-commit hook ile tsc + lint + build).

**Auth:** Email + Magic Link (D-018 prod email backend reuse, SMS yok). `_auth_customer_id` HttpOnly cookie. CSRF korumalı (D-018 pattern).

**Sadakat:** Tenant-level configurable (admin UI). 1 TL = N puan default 1.00. Redemption rate default 0.10 (1 puan = 0.10 TL). Min 100 puan = 10 TL indirim.

**Order entegrasyonu:** `Order.customer` FK SET_NULL nullable — misafir checkout + member checkout ikisi de çalışır. Award trigger `delivered` FSM atomic. Redemption server-side balance validasyon.

---

## 1. Alt Sprint Özetleri

### Sprint 10A — Backend (14 commit, ~3-4 saat worker + 1 root cleanup)

Büyük backend sprint. 4 model + 13 endpoint + 5 service + Order değişikliği.

**Modeller:**
- `Customer` (email unique, full_name, phone, last_login_at)
- `MagicLinkToken` (UUID4 + 15dk TTL + single-use, requested_ip audit)
- `LoyaltySettings` (tenant OneToOne, Decimal config, is_enabled default OFF)
- `LoyaltyTransaction` (ledger, unique idempotent `order+type='earn'`)
- `Order.customer` FK SET_NULL nullable (migration 0002 geriye uyumlu)

**Endpoint'ler (13 + 1 modify):**
- Public: `auth/request-link`, `auth/verify`, `auth/logout`, `me`, `me/orders`, `me/loyalty`, `loyalty/settings`
- Admin: `customers`, `customers/{id}`, `customers/{id}/loyalty-adjust`, `loyalty/settings` (GET + PUT)
- Modify: `public/orders` loyalty_points_to_redeem body field

**Services:** request_magic_link, verify_magic_link, award_points_for_order, redeem_points, customer_balance

**Audit (5 yeni action + 2 target_type):** customer_login, customer_registered, loyalty_earned, loyalty_redeemed, loyalty_adjusted

**Worker auth-expire:** Worker 12 commit + 71 test (22 auth + 18 loyalty + 31 views) tamamladı, test_security.py son testte auth-expire. Root devralıp 15 test + cleanup push etti. Toplam 14 commit, 86 yeni test.

Detay: `docs/SPRINT_10A_REPORT.md`

### Sprint 10B — Public UI (8 commit, ~22 dakika worker)

**5 yeni sayfa:**
- `/account` — dashboard (server component, profile + loyalty summary + recent orders + logout)
- `/account/login` — email form (MagicLinkLoginForm)
- `/account/verify?token=...` — server action tetikler
- `/account/orders` — paginated history (OrderHistoryList)
- `/account/loyalty` — full ledger + balance card (LoyaltyLedgerTable)

**9 yeni component:**
- `MagicLinkLoginForm` (client) + `AccountShell`, `CustomerDashboard`, `LogoutButton`
- `LoyaltyBadge` (client, header + checkout)
- `LoyaltyRedemptionCheckbox` (client, server-side discount calc)
- `OrderHistoryList`, `LoyaltyLedgerTable` (server, pagination)
- `CustomerDashboardClient`, `CustomerHydrator`, `AccountHeaderChip`

**Mevcut güncelleme:**
- `CheckoutForm.tsx` — customer email/full_name/phone auto-fill + redemption checkbox + discount display
- Header `/m/[slug]` — Hesabım link + LoyaltyBadge (conditional)

**Server actions:** `verifyMagicLinkAction`, `logoutCustomerAction` — Next.js 14 `cookies().set()/delete()` server action ile.

**API wrappers (8):** requestMagicLink, verifyMagicLink, logoutCustomer, fetchCustomerProfile, updateCustomerProfile, fetchCustomerOrders, fetchCustomerLoyalty, fetchPublicLoyaltySettings.

Detay: `docs/SPRINT_10B_REPORT.md`

### Sprint 10C — Admin UI (6 commit, ~13 dakika worker)

**3 yeni sayfa:**
- `/admin/loyalty` — LoyaltySettingsForm (GET + PUT + 404 empty state)
- `/admin/customers` — CustomerAdminList (search + pagination + empty/error)
- `/admin/customers/[customerId]` — CustomerDetailHeader + LoyaltyAdjustDialog

**4 yeni component:**
- `LoyaltySettingsForm` (client) — 5 input + is_enabled toggle + live preview + dirty-state + save
- `LoyaltyAdjustDialog` (client) — modal `window.dispatchEvent('loyalty-adjust:open')` ile tetiklenir
- `CustomerAdminList` (server) — 6-kolon tablo + search GET form
- `CustomerDetailHeader` (server) — profil + balance hero + per-org breakdown + recent orders + recent transactions

**Sidebar update:**
- +2 nav item: `Müşteriler` (Users icon), `Sadakat` (Award icon)
- Son sıra: Dashboard → Menüler → Siparişler → **Müşteriler** → Mutfak → QR Kodlar → PDF Import → **Sadakat** → Analitik → İşletme → Tema

**API wrappers (5):** fetchCustomers, fetchCustomerDetail, adjustLoyaltyPoints, fetchLoyaltySettings, updateLoyaltySettings.

Detay: `docs/SPRINT_10C_REPORT.md`

---

## 2. Toplam Commit Listesi (10A + 10B + 10C)

```
# 10A Backend (14 commit)
7473b20  chore(backend): account app scaffold + INSTALLED_APPS
8d2ba86  feat(audit): customer_* + loyalty_* action/target types
daf10cf  feat(account): Customer + MagicLinkToken + LoyaltySettings + LoyaltyTransaction + migration
741a751  feat(orders): Order.customer FK nullable + migration 0002
1a506bb  chore(backend): magic link + loyalty + customer session settings (D-025)
73f1b85  feat(account): magic link email template (HTML + txt)
1a98a52  feat(account): request_magic_link + verify_magic_link + loyalty services
e0b8e73  feat(account): views + serializers + urls (public + admin) + django admin
92d580e  feat(orders): Order.customer integration + loyalty redemption + loyalty award on delivered
6292ed8  test(account): customer_auth tests (22)
356ec06  test(account): loyalty tests (18)
294e675  test(account): view tests (31)
cac7511  test(account): security tests (15 — root cleanup, auth-expire sonrası)
60df919  chore(docs): Sprint 10A report (D-025 root eki)

# 10B Public UI (8 commit)
b1eb6d1  chore(frontend): api-account wrappers + account types
e073f20  feat(frontend): customer-store (zustand)
1401eb2  feat(frontend): MagicLinkLoginForm + /account/login + /account/verify
3f45246  feat(frontend): /account dashboard + customer components
041b3da  feat(frontend): OrderHistoryList + /account/orders pagination
cc0e116  feat(frontend): LoyaltyLedgerTable + /account/loyalty balance card
40b2e73  feat(frontend): CheckoutForm customer auto-fill + LoyaltyRedemptionCheckbox + Header Hesabım
686aca9  chore(docs): Sprint 10B report

# 10C Admin UI (6 commit)
da9a03a  chore(frontend): admin API + types for loyalty + customers
150d6f8  feat(frontend): LoyaltySettingsForm + /admin/loyalty page
89e7f4d  feat(frontend): CustomerAdminList + /admin/customers page
9171276  feat(frontend): CustomerDetailHeader + LoyaltyAdjustDialog + /admin/customers/[id] page
b5146b4  feat(frontend): AdminSidebar Müşteriler + Sadakat nav items
48e909f  chore(docs): Sprint 10C report
```

**Toplam Sprint 10:** **28 commit** (worker fonksiyonel + root docs). Backend 229 → **365 yeşil** (+86: 22 auth + 18 loyalty + 31 views + 15 security). Frontend tsc + lint + build tüm alt sprint'lerde clean.

---

## 3. D-025 Karar Özeti

| Karar | Tarih | Karar | Durum |
|---|---|---|---|
| **D-025** | 2026-09-28 | Müşteri Auth + Sadakat Puanı Pattern (Email Magic Link + HttpOnly session cookie + LoyaltySettings tenant OneToOne + LoyaltyTransaction ledger + unique idempotent award + server-side redemption validation + Order.customer FK nullable + audit 5 yeni action + 2 yeni target) | aktif |

### D-025 kritik pattern'lar
- **Auth: Email + Magic Link** (D-018 email backend reuse, SMS yok — maliyet 0)
- **Separate session** (`_auth_customer_id` HttpOnly cookie — admin auth'tan ayrı, `request.user` vs `get_current_customer()`)
- **Enumeration safe response** (her magic link request 200 döner, unknown email de)
- **Rate limit 5/hour per email** (AnonRateThrottle `magic_link_request`)
- **Idempotent award** (UniqueConstraint `(order, type)` WHERE type='earn' — IntegrityError handler)
- **Server-side balance validation** (client `loyalty_points_to_redeem` YOK sayılır — D-022 snapshot pattern)
- **Tenant isolation** (D-022 reuse, per-org ledger, cross-tenant 404)
- **Audit at view-layer** (D-023 ile aynı prensip — service audit etmez, view emit eder)

---

## 4. Sprint 10'da Öğrenilenler

1. **Worker varyansı: 13 dakika (10C) ↔ 4+ saat (10A).** Sprint büyüklüğü worker performansı için öncelikli tahmin faktörü değil; sprint boundary ve parçaların temizliği daha önemli. 10B (büyük public UI) 22 dakika bitti — net component boundary ile hızlı çıktı
2. **Spec drift kabul edilebilir:** 10C worker brief'te `/api/v1/admin/loyalty/settings/` demişti, gerçekte `/api/v1/account/admin/loyalty/settings/` (account app altında) — worker doğru API'yi keşfedip buna göre kodladı. Backend 10A spec tekrar gözden geçirilebilir veya bu kabul edilir (public + admin aynı app altında D-025 doğru kararı)
3. **10A auth-expire root devralma doğrulandı:** Worker 12 commit + 71 test sırasında expire oldu, root session `test_security.py` (15 test) + cleanup commit'le tamamladı. Toplam 14 commit + 86 test. Pattern başarıyla scale edilebilir
4. **Next.js 14 server actions `cookies().set()` valid:** Magic link verify + logout için server action ile cookie yazma/silme çalışır. Edge runtime not needed
5. **Cross-tenant 404 için `notFound()`** Next.js App Router — 10C customer detail sayfasında `e instanceof AdminApiError && e.status === 404` → `notFound()` redirect. Mevcut pattern
6. **Schema.org `suitableForDiet` translate** hala TODO (Sprint 9C'den) — Sprint 10 bu açığı kapatmadı, sıradaki sprint adayı (V2 backlog)
7. **Backend baseline 365 yeşil** — 4 büyük Sprint (8 + 9 + 10) boyunca cumulative feature eklemesi sıfır regresyonla başarıyla tamamlandı

---

## 5. V2 Backlog — Sprint 11 Adaylar

Sprint 10 ile V2'nin dördüncü feature'ı tamamlandı. **Müşteri artık email+şifresiz hesap açıp sadakat puanı kazanabiliyor.** V2 backlog'tan Sprint 11 için:

| Aday | Scope | Effort | V2 value |
|---|---|---|---|
| **Online Ödeme** | Stripe + iyzico/PayTR, checkout'a ödeme step, sipariş onayı ödeme onayına bağlı, webhook reconciliation | ~6-8 saat worker | Yüksek (revenue) |
| **Gerçek VPS Deploy** | Hetzner CX22 + Cloudflare DNS + Caddy reverse proxy + Sentry + Better Stack (D-004 prod config hazır) | ~3-4 saat worker + manuel SSH | Yüksek (go-live) |
| **Multi-Tenant Tenant Switcher** | Birden fazla işletme tek hesaptan, branch-aware analytics, organization-level permission | ~5-6 saat worker (architectural sprint) | Orta (SaaS scale) |
| **Real-time WebSocket + Ses Bildirimleri** | Mutfak + admin sipariş SSE push, Notification API audio | ~4-5 saat worker | Düşük (polling yeterli) |
| **SMS Provider** | Twilio/MessageBird OTP, müşteri telefon doğrulama | ~4-5 saat worker | Orta (engagement) |
| **Schema.org suitableForDiet + Recipe** | V1 içecek menüsü vegan/vegetarian inline label + yemek menüsü recipe rich result | ~2-3 saat worker | Düşük (SEO detail) |

**Sprint 11 önerim:** Online Ödeme (en yüksek V2 SaaS go-live value, D-022 snapshot pattern reuse + Stripe webhook reçetesi). Alternatif: Gerçek VPS Deploy (zaten D-004 hazır, en hızlı go-live).

---

## 6. Karar Geçmişi (Sprint 10 update)

| ID | Tarih | Karar | Durum |
|---|---|---|---|
| D-022 | 2026-09-26 | Order + Kitchen Flow Pattern | aktif |
| D-023 | 2026-09-28 | AI Translation + Description Pattern | aktif |
| D-024 | 2026-09-28 | Public SEO + Multi-Locale Schema Pattern | aktif |
| **D-025** | **2026-09-28** | **Müşteri Auth + Sadakat Puanı Pattern** | **aktif** |

Toplam karar sayısı: **25** (D-001..D-025). Son 4 sprint'te her biri önemli V2 feature için karar dokümante edildi.

---

## 7. V2 Feature Status (full picture — 4 feature tamamlandı)

| Feature | Sprint | Durum | Test | Endpoint | Component |
|---|---|---|---|---|---|
| AI PDF menu import | 7 | ✅ | 37 | 6 (admin) | Drag-drop + parse + confirm UI |
| Sipariş + Mutfak | 8 (8A+8B+8C) | ✅ | 58 | 6 (2 public + 4 admin) + kitchen | Cart drawer + checkout + admin list/detail + kitchen grid + ticket card |
| AI Çeviri + Açıklama + SEO | 9 (9A+9B+9C) | ✅ | 50 + 20 SEO | 5+1 (admin) + 0 (public extend) | AI assist + bulk modal + gap panel + JSON-LD |
| **Müşteri Hesabı + Sadakat** | **10 (10A+10B+10C)** | **✅ (yeni)** | **86 (sıfır regresyon)** | **13 (8 public + 5 admin) + 1 modify** | **9 public + 4 admin = 13 yeni** |

**V2 dört feature tamamlandı.** V1 + V2 demo akışı uçtan uca hazır:
- Müşteri: QR → menü (PDF'ten) → çok dilli AI çeviri → hesap aç (magic link) → sipariş → ödeme (V2 ileri)
- Operatör: PDF import (AI) → çok dilli içerik (AI) → sadakat settings → müşteri listesi → mutfak tablet (real-time) → sipariş onayı
- SEO: Google → hreflang → JSON-LD rich result → organik trafik → müşteri dönüşüm

Demo ready: **V1 + V2 = 4 SaaS-grade feature şimdi aktif.**
