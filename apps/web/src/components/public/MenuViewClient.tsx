"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  LocaleCode,
  PublicMenuAllergen,
  PublicMenuBusiness,
  PublicMenuCategory,
  PublicMenuDietaryTag,
  PublicMenuItem,
  PublicMenuMenu,
} from "@/types/menu";
import type { PublicSettings } from "@/types/public";
import { trackEvent } from "@/lib/events";
import { resolveCurrency } from "@/lib/currency";
import {
  FeatureFlagProvider,
  useFeatureFlag,
} from "@/lib/feature-flags";
import { UpgradeBanner } from "@/components/billing/UpgradeBanner";
import { CategoryNav } from "./CategoryNav";
import { CategorySection } from "./CategorySection";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { CartDrawer } from "./CartDrawer";
import { LocaleSelector } from "./LocaleSelector";
import { HeaderCartIcon } from "./HeaderCartIcon";
import { AccountHeaderChip } from "./AccountHeaderChip";
import { PrintButton } from "./PrintButton";
import { useCartStore } from "@/lib/cart-store";

interface MenuViewClientProps {
  /** Sprint B3b — server-fetched tenant plan / feature flags. `null`
   *  when the fetch failed or was skipped; provider falls back to
   *  safe-default (all flags off). */
  publicSettings: PublicSettings | null;
  businessSlug: string;
  /** Sprint A — full business payload so we can resolve currency from the
   *  tenant default when neither menu nor items carry one. */
  business: PublicMenuBusiness;
  /** Sprint A — menu payload so currency respects the menu-level override
   *  (when customer-facing menu-level currency rules land in V2). */
  menu: PublicMenuMenu | null;
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  locale: LocaleCode;
  /** Sprint 10B — current customer profile (cookie-backed). Null when
   *  the request has no customer session. */
  customerProfile?: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
  } | null;
  /** Sprint 10B — customer loyalty summary at this business. */
  customerLoyalty?: {
    balance: number;
    settings: import("@/types/account").PublicLoyaltySettings | null;
  } | null;
  /** SSR fallback for AccountHeaderChip (see Sprint 10B). */
  headerInitial?: {
    id: number;
    email: string;
    full_name: string;
  } | null;
  /** SSR fallback loyalty balance for AccountHeaderChip. */
  headerLoyaltyBalance?: number;
  /** Sprint B3b — server-rendered content that needs to live *inside*
   *  the FeatureFlagProvider subtree (e.g. BusinessHero, menu name
   *  caption, EmptyState when the catalog is empty). Passed through
   *  verbatim between the sticky header and the category grid so the
   *  visual order (header → hero → menu) is preserved. */
  children?: React.ReactNode;
}

/**
 * MenuViewClient — owns the drawer state + sticky header for the
 * public menu page.
 *
 * Sprint B3b refactor: this component now wraps its entire render
 * output in `<FeatureFlagProvider settings={publicSettings}>` so that
 * every descendant (AccountHeaderChip, HeaderCartIcon, CartFab, the
 * "Sipariş Ver" button inside CartDrawer / CheckoutForm, ItemCard's
 * "Sepete ekle" button) can call `useFeatureFlag(...)` directly.
 *
 * Splits the page so server components can stay server-only for the
 * heavy data fetch / SEO path, while we wrap the categories grid with
 * a thin client component that wires ItemCard `onSelect` into the
 * drawer.
 *
 * Analytics (Sprint 5B):
 *   - Fires `menu_view` once when the component mounts (the page is
 *     hydrated and the user is actually looking at the menu — server
 *     fetches don't count).
 *   - Fires `qr_open` when the URL carries `?qr=<id>` (came in via a
 *     scanned QR code). Same shape as `menu_view` but tagged so the
 *     analytics dashboard can split organic vs. QR traffic.
 *   - Refs guard the `useEffect` so the events fire exactly once per
 *     page lifetime even under React's StrictMode double-invoke.
 *
 * Sprint 8B:
 *   - Mounts `CartDrawer` and the floating cart button so the public
 *     menu page can place an order.
 *
 * Sprint A (Faz 1.2):
 *   - Currency now flows through the 4-step resolver chain so the cart,
 *     checkout, and order confirmation never drift apart.
 *
 * Sprint B3b:
 *   - Owns the sticky top header (logo + name + LocaleSelector +
 *     AccountHeaderChip + HeaderCartIcon) so every interactive piece
 *     can read feature flags via context. The server-rendered
 *     `BusinessHero` / menu-name caption / `EmptyState` are passed as
 *     `children` and rendered between the header and the grid so the
 *     visual order stays identical to the pre-B3b page.
 */
export function MenuViewClient({
  publicSettings,
  businessSlug,
  business,
  menu,
  categories,
  allergens,
  dietaryTags,
  locale,
  customerProfile,
  customerLoyalty,
  headerInitial,
  headerLoyaltyBalance,
  children,
}: MenuViewClientProps) {
  const [activeItem, setActiveItem] = useState<PublicMenuItem | null>(null);

  const handleSelect = useCallback((item: PublicMenuItem) => {
    setActiveItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setActiveItem(null);
  }, []);

  // Analytics: menu_view (once per mount) + qr_open (once if URL has ?qr=).
  const menuViewFired = useRef(false);
  const qrOpenFired = useRef(false);
  useEffect(() => {
    if (!menuViewFired.current) {
      menuViewFired.current = true;
      trackEvent("menu_view", { locale });
    }
    if (!qrOpenFired.current) {
      const params = new URLSearchParams(window.location.search);
      const qrParam = params.get("qr");
      if (qrParam) {
        const qrId = Number.parseInt(qrParam, 10);
        if (Number.isFinite(qrId)) {
          qrOpenFired.current = true;
          trackEvent("qr_open", { qr_id: qrId, locale });
        }
      }
    }
  }, [locale]);

  // Catalog lookup for cart thumbnails (fallback when an ItemCard was
  // rendered with a stale placeholder image — we still want to show the
  // real image inside the drawer).
  const catalogLookup: Record<number, PublicMenuItem> = {};
  const allItems: PublicMenuItem[] = [];
  for (const cat of categories) {
    for (const it of cat.items) {
      catalogLookup[it.id] = it;
      allItems.push(it);
    }
  }

  // Currency resolution chain (Sprint A — Faz 1.2):
  //   menu.currency → business.currency → first item.currency → "TRY"
  const currency = resolveCurrency(menu, business, allItems);

  const isEmpty =
    categories.length === 0 ||
    categories.every((c) => c.items.length === 0);

  return (
    <FeatureFlagProvider settings={publicSettings}>
      {/* Sprint B3b — sticky upgrade banner. Sits above the page
          header with a higher z-index so the prompt stays visible
          while the customer scrolls. Hidden when the tenant's plan
          already enables the highlighted feature (UpgradeBanner's
          internal `hasFeature` check). On BASIC all four flags are
          off so the cart banner shows; on PRO+ the cart feature is
          still off (orders+ only) but we promote the orders+ tier
          because that's the next relevant upgrade step for the
          demo customer. */}
      <UpgradeBanner
        feature="cart_enabled"
        targetPlan="orders"
        settings={publicSettings}
      />

      {/* Sticky top bar: logo + name + locale selector + account chip
          + cart icon + print button. The interactive bits
          (AccountHeaderChip / HeaderCartIcon) read feature flags via
          the provider above. Sprint D2 adds the PrintButton on the
          right side of the chrome — it triggers window.print() and
          relies on the global @media print rules (styles/print.css)
          to render a clean A4 page. Hidden on mobile (< md) because
          mobile browsers have no real print path. */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {business.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={business.logo}
                alt=""
                aria-hidden="true"
                className="h-7 w-7 shrink-0 rounded-full bg-surface object-cover ring-1 ring-border"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
              >
                {business.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span
              className="truncate font-heading text-sm font-semibold text-text sm:text-base"
              title={business.name}
            >
              {business.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Print button is desktop-only (≥ md) per Sprint D2 — see
                PrintButton component for the rationale. Click fires
                window.print() directly; the global @media print rules
                in styles/print.css strip the chrome so the printed
                output is a clean A4 menu. The dedicated
                /m/[slug]/print route exists as a bookmarkable
                preview / kiosk URL. */}
            <PrintButton />
            <LocaleSelector current={locale} />
            <AccountHeaderChip
              initialProfile={headerInitial}
              initialLoyaltyBalance={headerLoyaltyBalance}
            />
            <HeaderCartIcon />
          </div>
        </div>
      </header>

      {/* Server-rendered chrome (BusinessHero + menu caption +
          EmptyState when catalog is empty) — passed verbatim so the
          visual order stays header → hero → menu. */}
      {children}

      {!isEmpty ? (
        <MenuContent
          businessSlug={businessSlug}
          currency={currency}
          catalogLookup={catalogLookup}
          customerProfile={customerProfile}
          customerLoyalty={customerLoyalty}
          categories={categories}
          allergens={allergens}
          dietaryTags={dietaryTags}
          locale={locale}
          activeItem={activeItem}
          onItemSelect={handleSelect}
          onItemClose={handleClose}
        />
      ) : null}
    </FeatureFlagProvider>
  );
}

interface MenuContentProps {
  businessSlug: string;
  currency: string;
  catalogLookup: Record<number, PublicMenuItem>;
  customerProfile?: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
  } | null;
  customerLoyalty?: {
    balance: number;
    settings: import("@/types/account").PublicLoyaltySettings | null;
  } | null;
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  locale: LocaleCode;
  activeItem: PublicMenuItem | null;
  onItemSelect: (item: PublicMenuItem) => void;
  onItemClose: () => void;
}

/**
 * MenuContent — extracted inner subtree so the parent
 * `<FeatureFlagProvider>` from MenuViewClient is already in scope when
 * we call `useFeatureFlag` for the cart / order / payment gating.
 */
function MenuContent({
  businessSlug,
  currency,
  catalogLookup,
  customerProfile,
  customerLoyalty,
  categories,
  allergens,
  dietaryTags,
  locale,
  activeItem,
  onItemSelect,
  onItemClose,
}: MenuContentProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");
  const ordersEnabled = useFeatureFlag("orders_enabled");

  const totalItems = useCartStore((s) => s.totalItems());
  const openDrawer = useCartStore((s) => s.openDrawer);

  return (
    <>
      <CategoryNav categories={categories} />
      <div className="mx-auto mt-6 max-w-2xl space-y-8 px-4 pb-32 sm:pb-10">
        {categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            onItemSelect={onItemSelect}
          />
        ))}
      </div>

      {/* Floating cart button (mobile only — desktop gets the header
          icon). Hidden when the tenant disables cart feature OR when
          there are no items yet. */}
      {cartEnabled ? (
        <CartFab count={totalItems} onClick={openDrawer} />
      ) : null}

      <ItemDetailDrawer
        item={activeItem}
        allergens={allergens}
        dietaryTags={dietaryTags}
        locale={locale}
        onClose={onItemClose}
      />

      {/* CartDrawer also drives the CheckoutForm. Both render only
          when the tenant enables the cart feature. The CheckoutForm
          itself additionally gates the payment step on
          `payments_enabled` (Sprint B3b, see apps/web/src/components
          /public/CheckoutForm.tsx) and the order-submission action on
          `orders_enabled`. When `orders_enabled` is off but cart is on,
          we still let customers add items but the "Sipariş Ver"
          button is hidden inside CartDrawer (see that component). */}
      {cartEnabled ? (
        <CartDrawer
          businessSlug={businessSlug}
          currency={currency}
          catalogLookup={catalogLookup}
          customerProfile={customerProfile}
          customerLoyalty={customerLoyalty}
          ordersEnabled={ordersEnabled}
        />
      ) : null}
    </>
  );
}

function CartFab({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sepetim — ${count} ürün`}
      className="fixed bottom-6 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-floating transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 sm:hidden"
    >
      <span aria-hidden>🛒</span>
      Sepetim · {count}
    </button>
  );
}