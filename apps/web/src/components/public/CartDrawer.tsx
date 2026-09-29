"use client";

import { useState, useEffect, useRef } from "react";
import { X, Minus, Plus, Trash2, ShoppingBag, Receipt } from "lucide-react";
import type { PublicMenuItem } from "@/types/menu";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { CheckoutForm } from "./CheckoutForm";

interface CartDrawerProps {
  /** Current business slug — passed to CheckoutForm so the order payload
   *  carries `organization_slug`. */
  businessSlug: string;
  /** Locale for price formatting consistency. */
  currency: string;
  /** Map of menuItemId → item (for image fallback + currency/price sanity). */
  catalogLookup?: Record<number, PublicMenuItem>;
  /** Sprint 10B — current customer profile (cookie-backed). */
  customerProfile?: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
  } | null;
  /** Sprint 10B — loyalty summary for the customer at this business. */
  customerLoyalty?: {
    balance: number;
    settings: import("@/types/account").PublicLoyaltySettings | null;
  } | null;
  /** Sprint B3b — when `false`, the "Sipariş Ver" CTA is hidden and
   *  the customer can still inspect / edit the cart but cannot
   *  submit. CartDrawer is mounted unconditionally when `cart_enabled`
   *  is on; this flag decides whether the bottom submit button shows.
   *  Defaults to `true` to preserve pre-B3b behavior for callers that
   *  haven't threaded the flag through yet. */
  ordersEnabled?: boolean;
}

/**
 * CartDrawer — floating cart panel.
 *
 * Mobile: bottom sheet sliding up from below (full width, half height).
 * Desktop (sm+): right-side drawer.
 *
 * Composition:
 *   - Header: title + item count + close
 *   - Items list: thumbnail + name + qty controls + subtotal + remove
 *   - Empty state when no items
 *   - Footer: total + "Sipariş Ver" → opens CheckoutForm modal
 *
 * State (open/close) is owned by the Zustand cart store so the
 * "Sepete ekle" action from ItemCard can flip it open automatically.
 */
export function CartDrawer({
  businessSlug,
  currency,
  catalogLookup,
  customerProfile,
  customerLoyalty,
  ordersEnabled = true,
}: CartDrawerProps) {
  const isOpen = useCartStore((s) => s.isOpen);
  const closeDrawer = useCartStore((s) => s.closeDrawer);
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const remove = useCartStore((s) => s.remove);
  const totalAmount = useCartStore((s) => s.totalAmount());

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Lock body scroll + listen for Escape when drawer is open.
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !checkoutOpen) closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => closeBtnRef.current?.focus());
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, closeDrawer, checkoutOpen]);

  if (!isOpen) return null;

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const cur = items[0]?.currency ?? currency;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="fixed inset-0 z-40 flex items-end justify-center bg-text/40 backdrop-blur-sm sm:items-stretch sm:justify-end"
        onClick={closeDrawer}
      >
        <div
          className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-floating sm:max-h-full sm:h-full sm:w-96 sm:rounded-none"
          onClick={(e) => e.stopPropagation()}
          style={{ animation: "slideup 0.22s ease-out" }}
        >
          {/* Header */}
          <header className="sticky top-0 flex items-center justify-between gap-2 border-b border-border bg-surface px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" aria-hidden />
              <h2
                id="cart-drawer-title"
                className="font-heading text-base font-bold text-text sm:text-lg"
              >
                Sepetim
              </h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {itemCount} ürün
              </span>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={closeDrawer}
              aria-label="Kapat"
              className="touch-target inline-flex items-center justify-center rounded-full p-2 text-muted hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          {/* Items */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {items.length === 0 ? (
              <EmptyCart />
            ) : (
              <ul className="space-y-3">
                {items.map((item) => {
                  const cat = catalogLookup?.[item.menuItemId];
                  const subtotal =
                    Number.parseFloat(item.price) * item.quantity;
                  return (
                    <li
                      key={item.menuItemId}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface">
                        {item.image || cat?.image ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={(item.image ?? cat?.image) as string}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl">
                            🍽️
                          </div>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <p
                          className="truncate text-sm font-semibold text-text"
                          title={item.name}
                        >
                          {item.name}
                        </p>
                        <p className="text-xs text-muted">
                          {formatPrice(item.price, item.currency)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.menuItemId, item.quantity - 1)
                            }
                            aria-label="Azalt"
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <Minus className="h-3 w-3" aria-hidden />
                          </button>
                          <span
                            aria-live="polite"
                            className="min-w-[1.25rem] text-center font-heading text-sm font-semibold tabular-nums text-text"
                          >
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.menuItemId, item.quantity + 1)
                            }
                            aria-label="Arttır"
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-text transition hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <Plus className="h-3 w-3" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.menuItemId)}
                            aria-label={`${item.name} sepetten çıkar`}
                            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent"
                          >
                            <Trash2 className="h-3 w-3" aria-hidden />
                            Çıkar
                          </button>
                        </div>
                        {item.notes ? (
                          <p className="mt-1 line-clamp-1 text-[11px] italic text-muted">
                            Not: {item.notes}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm font-bold text-primary tabular-nums">
                        {formatPrice(subtotal.toFixed(2), item.currency)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 ? (
            <footer className="sticky bottom-0 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
              <div className="mb-3 flex items-end justify-between">
                <span className="text-xs uppercase tracking-wider text-muted">
                  Toplam
                </span>
                <span className="font-heading text-xl font-bold text-primary tabular-nums">
                  {formatPrice(totalAmount.toFixed(2), cur)}
                </span>
              </div>
              {/* Sprint B3b — the order submission CTA is gated on
                  `orders_enabled`. With the feature off, the cart
                  remains usable for browsing but the customer can no
                  longer submit — the spec note in CartDrawerProps
                  explains the rationale. */}
              {ordersEnabled ? (
                <button
                  type="button"
                  onClick={() => setCheckoutOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  <Receipt className="h-4 w-4" aria-hidden />
                  Sipariş Ver
                </button>
              ) : (
                <p
                  role="status"
                  className="rounded-md border border-border bg-background px-3 py-2 text-center text-xs text-muted"
                >
                  Sipariş verme bu pakete dahil değil.
                </p>
              )}
            </footer>
          ) : null}
        </div>
      </div>

      <CheckoutForm
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        businessSlug={businessSlug}
        currency={cur}
        customerProfile={customerProfile}
        customerLoyalty={customerLoyalty}
      />

      <style>{`
        @keyframes slideup {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

function EmptyCart() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ShoppingBag className="h-7 w-7" aria-hidden />
      </div>
      <p className="font-heading text-base font-semibold text-text">
        Sepetiniz boş
      </p>
      <p className="mt-1 max-w-[18rem] text-xs text-muted">
        Menüden beğendiğiniz ürünleri ekleyin, &ldquo;Sipariş Ver&rdquo; ile
        tamamlayalım.
      </p>
    </div>
  );
}