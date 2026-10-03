"use client";

import { useState } from "react";
import { Info, Minus, Plus, Receipt, ShoppingBag, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { SmartImage } from "@/components/ui/SmartImage";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import type { PublicMenuItem } from "@/types/menu";
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
 * CartDrawer — the customer's basket.
 *
 * Phones: a bottom sheet. Larger screens: a right-hand drawer. Both come from
 * `Sheet` (native modal <dialog>), which brings the focus trap, Escape,
 * tap-outside and drag-down-to-dismiss.
 *
 * Composition:
 *   - Header: title + item count
 *   - Items: thumbnail (only when the dish has a photo) + name + quantity
 *     stepper + line total + remove
 *   - Empty state when there is nothing in the cart
 *   - Footer: total + "Sipariş Ver" → opens the CheckoutForm sheet
 *
 * Open/closed state lives in the Zustand cart store so the "Sepete ekle"
 * action can open it automatically.
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

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const cur = items[0]?.currency ?? currency;

  return (
    <>
      <Sheet
        open={isOpen}
        onClose={closeDrawer}
        variant="drawer"
        title="Sepetim"
        headerExtra={
          itemCount > 0 ? <Badge tone="primary">{itemCount} ürün</Badge> : null
        }
        bodyClassName="px-5 py-1"
        footer={
          items.length > 0 ? (
            <div className="space-y-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-muted">Toplam</span>
                <span className="font-heading text-2xl font-semibold tabular-nums text-primary">
                  {formatPrice(totalAmount.toFixed(2), cur)}
                </span>
              </div>
              {/* Sprint B3b — the order submission CTA is gated on
                  `orders_enabled`. With the feature off, the cart remains
                  usable for browsing but the customer can no longer submit. */}
              {ordersEnabled ? (
                <Button
                  size="lg"
                  fullWidth
                  onClick={() => setCheckoutOpen(true)}
                  leadingIcon={<Receipt className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
                >
                  Sipariş Ver
                </Button>
              ) : (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 rounded-xl bg-surface-low px-4 py-3 text-sm text-muted"
                >
                  <Info className="h-4 w-4 shrink-0" aria-hidden />
                  Sipariş verme bu pakete dahil değil.
                </p>
              )}
            </div>
          ) : null
        }
      >
        {items.length === 0 ? (
          <EmptyCart />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const cat = catalogLookup?.[item.menuItemId];
              const thumb = item.image ?? cat?.image ?? null;
              const subtotal = Number.parseFloat(item.price) * item.quantity;
              return (
                <li key={item.menuItemId} className="flex gap-3.5 py-4">
                  {thumb ? (
                    <SmartImage
                      src={thumb}
                      alt=""
                      aria-hidden
                      thumbnail
                      wrapperClassName="h-16 w-16 shrink-0 rounded-xl"
                    />
                  ) : null}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-2 font-semibold leading-snug text-text">
                        {item.name}
                      </p>
                      <span className="shrink-0 font-semibold tabular-nums text-primary">
                        {formatPrice(subtotal.toFixed(2), item.currency)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm tabular-nums text-muted">
                      {formatPrice(item.price, item.currency)}
                    </p>
                    {item.notes ? (
                      <p className="mt-1 line-clamp-1 text-xs italic text-outline">
                        Not: {item.notes}
                      </p>
                    ) : null}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <div className="flex h-10 items-center rounded-pill bg-surface-low ring-1 ring-border">
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.menuItemId, item.quantity - 1)
                          }
                          aria-label="Azalt"
                          className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition hover:bg-surface-high active:scale-90"
                        >
                          <Minus className="h-4 w-4" aria-hidden />
                        </button>
                        <span
                          aria-live="polite"
                          className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums text-text"
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateQuantity(item.menuItemId, item.quantity + 1)
                          }
                          aria-label="Arttır"
                          className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition hover:bg-surface-high active:scale-90"
                        >
                          <Plus className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.menuItemId)}
                        aria-label={`${item.name} sepetten çıkar`}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Çıkar
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      <CheckoutForm
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        businessSlug={businessSlug}
        currency={cur}
        customerProfile={customerProfile}
        customerLoyalty={customerLoyalty}
      />
    </>
  );
}

function EmptyCart() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center px-4 py-14 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
        <ShoppingBag className="h-8 w-8" aria-hidden />
      </div>
      <p className="font-heading text-lg font-semibold text-text">
        Sepetiniz boş
      </p>
      <p className="mt-1.5 max-w-[18rem] text-sm text-muted">
        Menüden beğendiğiniz ürünleri ekleyin, &ldquo;Sipariş Ver&rdquo; ile
        tamamlayalım.
      </p>
    </div>
  );
}
