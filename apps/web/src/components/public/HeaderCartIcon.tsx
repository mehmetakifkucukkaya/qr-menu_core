"use client";

import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";
import { useFeatureFlag } from "@/lib/feature-flags";

/**
 * HeaderCartIcon — cart trigger in the sticky top bar.
 *
 * A round glass button with a count badge; clicking opens the cart drawer.
 * On phones the bottom dock shows the running total as well, but this stays
 * visible on every size so the cart is always one tap away.
 *
 * Sprint B3b — feature flag gated. Hidden entirely when the tenant's plan
 * disables the shopping cart (`cart_enabled === false`), which is also the
 * condition that hides the dock's cart button and the "Sepete Ekle" controls,
 * so the whole cart UX disappears coherently for BASIC-tier tenants.
 */
export function HeaderCartIcon() {
  const cartEnabled = useFeatureFlag("cart_enabled");
  const totalItems = useCartStore((s) => s.totalItems());
  const openDrawer = useCartStore((s) => s.openDrawer);

  if (!cartEnabled) return null;

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={totalItems > 0 ? `Sepetim — ${totalItems} ürün` : "Sepetim"}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-text shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-200 hover:bg-surface active:scale-95"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {totalItems > 0 ? (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-secondary px-1 text-[11px] font-bold tabular-nums leading-none text-white shadow-sm ring-2 ring-background animate-pop"
        >
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      ) : null}
    </button>
  );
}
