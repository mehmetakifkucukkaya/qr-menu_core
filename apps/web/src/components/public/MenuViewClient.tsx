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
import { trackEvent } from "@/lib/events";
import { resolveCurrency } from "@/lib/currency";
import { CategoryNav } from "./CategoryNav";
import { CategorySection } from "./CategorySection";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { CartDrawer } from "./CartDrawer";
import { useCartStore } from "@/lib/cart-store";

interface MenuViewClientProps {
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
}

/**
 * MenuViewClient — owns the drawer state for the public menu page.
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
 */
export function MenuViewClient({
  businessSlug,
  business,
  menu,
  categories,
  allergens,
  dietaryTags,
  locale,
  customerProfile,
  customerLoyalty,
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

  const totalItems = useCartStore((s) => s.totalItems());
  const openDrawer = useCartStore((s) => s.openDrawer);

  // Currency resolution chain (Sprint A — Faz 1.2):
  //   menu.currency → business.currency → first item.currency → "TRY"
  const currency = resolveCurrency(menu, business, allItems);

  return (
    <>
      <CategoryNav categories={categories} />
      <div className="mx-auto mt-6 max-w-2xl space-y-8 px-4 pb-32 sm:pb-10">
        {categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            onItemSelect={handleSelect}
          />
        ))}
      </div>

      {/* Floating cart button (mobile only — desktop gets the header
          icon from the menu page itself). */}
      <CartFab count={totalItems} onClick={openDrawer} />

      <ItemDetailDrawer
        item={activeItem}
        allergens={allergens}
        dietaryTags={dietaryTags}
        locale={locale}
        onClose={handleClose}
      />

      <CartDrawer
        businessSlug={businessSlug}
        currency={currency}
        catalogLookup={catalogLookup}
        customerProfile={customerProfile}
        customerLoyalty={customerLoyalty}
      />
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