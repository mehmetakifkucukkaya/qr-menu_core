"use client";

import { ShoppingBag } from "lucide-react";

import { useCartStore } from "@/lib/cart-store";
import { useFeatureFlag } from "@/lib/feature-flags";
import { formatPrice } from "@/lib/format";
import type { PublicMenuBusiness, PublicMenuCta } from "@/types/menu";
import { ContactActions, hasDockContact } from "./ContactActions";

interface BottomDockProps {
  business: Pick<PublicMenuBusiness, "phone" | "address" | "google_maps_url">;
  cta: PublicMenuCta;
  /** Fallback currency when the cart is empty. */
  currency: string;
}

/**
 * BottomDock — ONE floating bar for phones and tablets, replacing the two
 * independent fixed elements (call/WhatsApp bar + cart button) that used to
 * sit on top of each other.
 *
 *   empty cart :  ( ☎  💬 )                      — quick contact only
 *   with items :  ( ☎  💬 | 🛍 2  Sepetim ₺150,00 ) — cart becomes the main action
 *
 * It is hidden from `lg`, where the desktop layout shows the cart in a side
 * rail instead. Contact buttons only render when the tenant has the data, and
 * the cart half follows the `cart_enabled` plan flag.
 */
export function BottomDock({ business, cta, currency }: BottomDockProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");
  const items = useCartStore((s) => s.items);
  const count = useCartStore((s) => s.totalItems());
  const total = useCartStore((s) => s.totalAmount());
  const openDrawer = useCartStore((s) => s.openDrawer);

  const showCart = cartEnabled && count > 0;
  const showContact = hasDockContact(business, cta);
  if (!showCart && !showContact) return null;

  const cartCurrency = items[0]?.currency ?? currency;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-dock flex justify-center px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden">
      <div className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-pill p-1.5 shadow-lg ring-1 ring-black/5 animate-slide-up">
        <ContactActions variant="icons" business={business} cta={cta} />

        {showCart ? (
          <button
            type="button"
            onClick={openDrawer}
            aria-label={`Sepetim — ${count} ürün`}
            className="ml-1 flex h-11 items-center gap-2.5 rounded-pill bg-primary pl-3.5 pr-4 text-primary-foreground shadow-md transition duration-200 hover:bg-primary/90 active:scale-[0.97]"
          >
            <span className="relative">
              <ShoppingBag className="h-5 w-5" aria-hidden />
              <span
                aria-hidden
                className="absolute -right-2 -top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-secondary px-1 text-[10px] font-bold tabular-nums leading-none text-white ring-2 ring-primary"
              >
                {count > 99 ? "99+" : count}
              </span>
            </span>
            <span className="text-sm font-semibold">Sepetim</span>
            <span className="text-sm font-semibold tabular-nums opacity-90">
              {formatPrice(total.toFixed(2), cartCurrency)}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
