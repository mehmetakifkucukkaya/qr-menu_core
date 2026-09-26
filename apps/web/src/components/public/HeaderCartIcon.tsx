"use client";

import { ShoppingBag } from "lucide-react";
import { useCartStore } from "@/lib/cart-store";

/**
 * HeaderCartIcon — desktop cart trigger (sm+).
 *
 * Rendered in the sticky top bar next to LocaleSelector. Shows a small
 * badge with the total quantity; clicking opens the cart drawer. On
 * mobile the floating CartFab in MenuViewClient takes over (the header
 * icon is still visible but the floating button is more discoverable).
 */
export function HeaderCartIcon() {
  const totalItems = useCartStore((s) => s.totalItems());
  const openDrawer = useCartStore((s) => s.openDrawer);

  return (
    <button
      type="button"
      onClick={openDrawer}
      aria-label={totalItems > 0 ? `Sepetim — ${totalItems} ürün` : "Sepetim"}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <ShoppingBag className="h-5 w-5" aria-hidden />
      {totalItems > 0 ? (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground shadow-sm"
        >
          {totalItems > 99 ? "99+" : totalItems}
        </span>
      ) : null}
    </button>
  );
}