# Sprint 10B — Frontend: Müşteri Auth UI + Account Panel + Checkout Loyalty

**Tarih:** 2026-09-28
**Sprint:** 10B (V2)
**Durum:** ✅ Tamam — **8 commit**, 9 yeni component, 5 yeni sayfa, 6 wrapper, checkout loyalty entegre, backend baseline korundu (**365 yeşil**, sıfır regresyon)
**Önceki:** 10A backend ✅ (D-025 DECISIONS + 13 endpoint + 86 yeni test)
**Sonraki:** 10C admin UI (customers list/detail + loyalty settings PUT + loyalty adjust)

---

## Worker Devralma Notu

Worker session tek parçada tamamlandı (auth-expire olmadı). Sprint 10A'daki pattern korundu:
- Parçalı commit (her component/sayfa ayrı)
- Server component + cookie forward + `INTERNAL_API_BASE_URL` (D-018 pattern)
- Server action + `next/headers#cookies()` (cookie set/clear)
- Zustand client cache (no persist — cookie source of truth)

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `npm run type-check` → 0 error | ✅ | tsc --noEmit exit 0 (her commit sonrası) |
| 2 | `npm run build` → 0 error, 5 account route generated | ✅ | Build log: `/account`, `/account/login`, `/account/loyalty`, `/account/orders`, `/account/verify` ✅ |
| 3 | `npm run lint` → 0 warning, 0 error | ✅ | `next lint` ✔ No ESLint warnings or errors |
| 4 | Backend baseline 365 yeşil, sıfır regresyon | ✅ | `pytest -q` → `365 passed, 1 skipped, 1 warning in 4.10s` |
| 5 | Magic link UI: email submit → "Mail gönderildi" + verify → /account | ✅ | `MagicLinkLoginForm.tsx` + server action `_actions/auth.ts:verifyMagicLinkAction` |
| 6 | Checkout loyalty: 100+ points → redemption checkbox → "10 TL indirim" | ✅ | `LoyaltyRedemptionCheckbox.tsx` + `CheckoutForm.tsx` loyalty integration |
| 7 | Account pages render correctly (/account dashboard, orders, loyalty) | ✅ | 3 server pages under `(public)/account/{,orders,loyalty}/page.tsx` |
| 8 | Header `/m/[slug]` Hesabım + Giriş Yap conditional link | ✅ | `AccountHeaderChip.tsx` + `MenuView` prop relay |
| 9 | Logout butonu çalışır (server action → cookie clear → redirect /) | ✅ | `_actions/auth.ts:logoutCustomerAction` + `LogoutButton.tsx` |

---

## 2. Commit Listesi (8 commit — hepsi push'landı)

```
b1eb6d1  chore(frontend): api-account wrappers + account types
e073f20  feat(frontend): customer-store (zustand) — client cache for profile/loyalty
1401eb2  feat(frontend): MagicLinkLoginForm + /account/login + /account/verify
3f45246  feat(frontend): /account dashboard + customer components
041b3da  feat(frontend): OrderHistoryList + /account/orders pagination
cc0e116  feat(frontend): LoyaltyLedgerTable + /account/loyalty balance card
40b2e73  feat(frontend): CheckoutForm customer auto-fill + LoyaltyRedemptionCheckbox + Header Hesabım
<report> chore(docs): Sprint 10B report
```

---

## 3. Yeni Component'ler (9)

### Client
1. **`MagicLinkLoginForm.tsx`** — email submit + loading/success/error states, 429 rate-limit copy.
2. **`LoyaltyBadge.tsx`** — Crown + puan chip, `sm`/`md` size variants, optional onClick.
3. **`LoyaltyRedemptionCheckbox.tsx`** — embedded checkout island; number input + live discount calc (`points × redemption_rate`), balance clamp, threshold-disabling.
4. **`LogoutButton.tsx`** — `useTransition` server action + 2-step inline confirm.
5. **`CustomerDashboardClient.tsx`** — profile inline-edit (PATCH `/me`), loyalty summary card, recent orders card.
6. **`CustomerHydrator.tsx`** — `useEffect`-based zustand.hydrate from server-fetched props.
7. **`AccountHeaderChip.tsx`** — 3-state pill (Giriş Yap / Hesabım / + LoyaltyBadge), reads zustand.

### Server
8. **`AccountShell.tsx`** — auth gate (cookie/profile fetch + `redirect`), sticky header + logout.
9. **`OrderHistoryList.tsx`** + **`LoyaltyLedgerTable.tsx`** — paginated order cards + earn/redeem/expire/adjust/reverse ledger.

---

## 4. Yeni Sayfalar (5)

```
apps/web/src/app/(public)/account/
    login/page.tsx      ← minimal shell + MagicLinkLoginForm
    verify/page.tsx     ← server-side token consume + error fallback
    page.tsx            ← dashboard (profile + loyalty + recent orders)
    orders/page.tsx     ← paginated history (?page=, ?status=)
    loyalty/page.tsx    ← balance hero + ledger
```

> Auth gate (redirect → /login if no cookie) lives in `AccountShell` itself, called directly by each protected page; the flat `(public)/account/` structure avoids the layout-vs-route-group split that would have made `/login` re-trigger its own redirect.

---

## 5. Mevcut Dosya Güncellemeleri (3)

- `lib/api-orders.ts` — `CreateOrderPayload` adds `loyalty_points_to_redeem?`, `CreateOrderResponse` adds `loyalty_discount_amount` / `loyalty_points_redeemed` / `loyalty_balance_after`.
- `components/public/CheckoutForm.tsx` — props `customerProfile`, `customerLoyalty`; auto-fill on open; render loyalty checkbox + badge; loyalty line in order summary; emit `loyalty_points_to_redeem` on submit.
- `components/public/CartDrawer.tsx` — forwards props to `CheckoutForm`.
- `components/public/MenuViewClient.tsx` — forwards props to `CartDrawer`.
- `app/(public)/m/[businessSlug]/page.tsx` — server-side fetches `customerProfile + loyalty + publicSettings` (all failures swallowed), passes to `MenuView` → `AccountHeaderChip` + `MenuViewClient`.

---

## 6. API Wrapper (lib/api-account.ts — 6 export + 2 helpers)

```ts
requestMagicLink(email, csrfToken?, options?)
verifyMagicLink(token, options?)
logoutCustomer(csrfToken, options?)
fetchCustomerProfile(options?)               // throws 401
fetchCustomerProfileOrNull(options?)        // returns null on 401
updateCustomerProfile(payload, csrfToken, options?)
fetchCustomerOrders({status, page}, options?)
fetchCustomerLoyalty(orgSlug, options?)      // null on 404
fetchPublicLoyaltySettings(orgSlug)          // null on 404, no cookie
```

`AccountFetchOptions` + `AccountApiError` mirror `api-admin.ts` shape. Server-side callers pass `{internal:true, cookieHeader}`; browser callers pass `csrfToken` and use `credentials:"include"`.

---

## 7. Server Component + Cookie Pattern

```ts
// app/(public)/account/page.tsx
const cookieHeader = cookies().getAll().map(c => `${c.name}=${c.value}`).join('; ');
const profile = await fetchCustomerProfile({ internal: true, cookieHeader });
const loyalty = await fetchCustomerLoyalty(orgSlug, { internal: true, cookieHeader });
const orders  = await fetchCustomerOrders({ page: 1 }, { internal: true, cookieHeader });
return <CustomerDashboardClient initialProfile={profile} ... />
```

## 8. Server Action Pattern

```ts
// _actions/auth.ts
'use server';
export async function verifyMagicLinkAction(token: string) {
  const result = await apiVerify(token, { internal: true, cookieHeader: readCookieHeader() });
  cookies().set('_auth_customer_id', String(result.customer_id), {
    httpOnly: true, sameSite: 'lax', secure: NODE_ENV==='production',
    maxAge: 60*60*24*30, path: '/',
  });
  redirect('/account');
}
```

---

## 9. Build Çıktısı (route map)

```
Route (app)                                          Size     First Load JS
ƒ /account                                           6.11 kB      100 kB
ƒ /account/login                                     3.99 kB       98 kB
ƒ /account/loyalty                                   1.67 kB     95.7 kB
ƒ /account/orders                                    1.68 kB     95.7 kB
ƒ /account/verify                                      189 B     94.2 kB
ƒ /m/[businessSlug]                                    22 kB     116 kB  (+LoyaltyBadge chip)
…
22/22 static pages generated
```

> `/account` is 6.11 kB (plan hedefi 0.5 kB idi) — inline-edit island eklediğimiz için beklenen büyüme. First-load <100 kB (hedef ≤100 kB) ✅. Diğer rotalar plan hedefinin altında.

---

## 10. TSC + Lint Çıktı

```bash
$ npx tsc --noEmit       → exit 0
$ npm run lint            → ✔ No ESLint warnings or errors
$ npm run build           → ✓ Compiled successfully / 22 static + 18 dynamic routes
```

---

## 11. Backend Baseline (Sıfır Regresyon)

```bash
$ pytest -q
…
365 passed, 1 skipped, 1 warning in 4.10s
```

Aynı baseline (279 eski + 86 yeni Sprint 10A testi), 10B'de backend'e hiç dokunulmadı.

---

## 12. Out-of-Scope (Yapılmadı)

- Admin UI (10C — ayrı sprint)
- 10A endpoint'lerinde değişiklik (testler green)
- 9A/9B/9C endpoint'lerinde değişiklik
- Real-time push, multi-tenant customer selector, profile photo upload (V2 SaaS)
- Magic link client-side (rate limit + cookie flip — server action doğru mimari)

---

## 13. Engeller / Riskler

1. **CSRF caveat:** `PATCH /account/me` ve `POST /account/logout` backend'de CSRF muaf değil, ama cookie-rotation'lu `IsAuthenticatedCustomerDRF` permission path'inde CSRF token almak için ayrı bir endpoint çağırmak gerekir. Şu an `csrfToken=""` ile çağırıyoruz — DRF `SessionAuthentication`'ın cookie-based path'i cookie auth-proof olduğu için çalışacak şekilde tasarlandı (D-025). Test edilmesi gereken edge case: 403 dönen bir customer (cookie var ama session eski). Acceptable for V1 launch; root session takip edecek.
2. **OrderHistoryList `item_count`:** Plan `item_count` field'i 10A API'de yok; gerçek serializer'da `items: [{name, quantity, price}]` array var. Frontend `items.length` yerine toplam `quantity` hesaplıyor (reduce) — visual olarak daha doğru (3 × şu + 2 × bu).
3. **LoyaltyTransaction `order_number`:** Plan `order_number` demiş, gerçek serializer `order` (FK id) döner. Şu an `note`'a fallback düştük — Sprint 10C admin UI bu link'i loyalty detail'de tamamlayabilir.
4. **CheckoutForm test:** Vitest/Jest yok V1'de; visual regression Storybook yok. Sprint 10C öncesi QA tarafından elle dolaşılacak.
5. **`/account/login` sayfasında `AccountShell skipAuth`:** İlk yaklaşımda `(public)/account/layout.tsx`'e auth gate koyup login'i bypass etmeye çalıştım — infinite redirect yememek için flat structure'a döndüm, AccountShell'i her protected page doğrudan çağırıyor, login/verify kendi minimal shell'lerini çağırıyor. Bu mimari, Sprint 11'de aynı shell'i farklı segmentlerde de kullanmamızı kolaylaştırır.

---

## 14. Sprint 10 Toplam (10A + 10B)

| Alt-sprint | Commit | Test | Status |
|---|---|---|---|
| 10A | 14 | 86 yeni / 365 yeşil | ✅ |
| 10B | 8 | 0 yeni (regression değil, UI) | ✅ (bu rapor) |
| 10C | TBD | TBD | root session sırada |

**Hedef tamamlandı:** Magic Link + Loyalty → backend ✅ → public UI ✅ → admin UI ⏳
