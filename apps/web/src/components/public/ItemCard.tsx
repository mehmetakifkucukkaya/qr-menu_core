"use client";

import { useState } from "react";
import { ChevronRight, Plus, Check, Minus } from "lucide-react";
import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";
import { getItemPlaceholder } from "@/lib/placeholder";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { useFeatureFlag } from "@/lib/feature-flags";

interface ItemCardProps {
  item: PublicMenuItem;
  category: PublicMenuCategory;
  /** Sprint 3B-2: opens the detail drawer. Sprint 8B: replaced with
   *  in-card "Sepete ekle" so detail is non-blocking. Kept for
   *  backward compat — when provided, chevron still opens detail. */
  onSelect?: (item: PublicMenuItem) => void;
}

/**
 * ItemCard — V1 + Sprint 8B "Sepete ekle".
 *
 * Renders image + name + description + price, then a quick-add control:
 *   - Item not in cart → green "+ Sepete ekle" button. Brief "Eklendi"
 *     pulse feedback after add.
 *   - Item already in cart → qty selector (+ / count / −) inline.
 *
 * Both modes open the cart drawer (handled inside the store's `add`).
 * The chevron at the right still opens the detail drawer for nutrition
 * / allergen info (still useful for the allergic customer).
 */
export function ItemCard({ item, category, onSelect }: ItemCardProps) {
  // Sprint B3b — feature flag gate. Hides the entire cart button /
  // qty selector group when the tenant disables shopping-cart. The
  // chevron button (opens detail drawer) is kept so the customer can
  // still inspect nutrition / allergen info even when ordering is off.
  const cartEnabled = useFeatureFlag("cart_enabled");

  // Start with DB image, fall back to category-derived SVG placeholder.
  const [src, setSrc] = useState<string>(
    item.image || getItemPlaceholder({ ...item, category_slug: category.slug }),
  );

  const handleError = () => {
    const fallback = getItemPlaceholder({
      ...item,
      category_slug: category.slug,
    });
    if (fallback !== src) setSrc(fallback);
  };

  // Cart integration ----------------------------------------------------
  const cartItem = useCartStore((s) =>
    s.items.find((i) => i.menuItemId === item.id),
  );
  const add = useCartStore((s) => s.add);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  const [pulse, setPulse] = useState(false);

  const handleAdd = () => {
    add(
      {
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        currency: item.currency,
        image: item.image ?? null,
        categorySlug: category.slug,
      },
      1,
    );
    setPulse(true);
    // Brief "eklendi" feedback; 900ms is short enough to feel snappy.
    window.setTimeout(() => setPulse(false), 900);
  };

  const handleInc = () => {
    if (cartItem) updateQuantity(item.id, cartItem.quantity + 1);
    else handleAdd();
  };

  const handleDec = () => {
    if (cartItem) updateQuantity(item.id, cartItem.quantity - 1);
  };

  return (
    <article
      className="group flex gap-3 rounded-lg border border-border bg-surface p-3 shadow-card transition hover:shadow-floating focus-within:ring-2 focus-within:ring-primary sm:gap-4 sm:p-4"
    >
      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-background sm:h-24 sm:w-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={item.name}
          onError={handleError}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {item.spice_level > 0 ? (
          <span
            aria-label={`Acı seviyesi ${item.spice_level}`}
            className="absolute right-1 top-1 rounded-full bg-accent/90 px-1.5 py-0.5 text-[10px] font-semibold text-white"
          >
            🌶{item.spice_level}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sprint D1b — title is now a secondary tap target for the
            detail drawer. The chevron button on the right is still the
            primary affordance (already wired pre-D1b); making the title
            clickable too gives thumb-friendlier access on mobile without
            stealing taps from the cart "Sepete ekle" button (that button
            lives in a sibling flex column so it never overlaps the title
            area). The h3 carries the semantic heading; the click handler
            is a thin wrapper so the markup stays valid (no nested
            interactive elements). */}
        <h3
          role="button"
          tabIndex={0}
          onClick={() => onSelect?.(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.(item);
            }
          }}
          aria-label={`${item.name} detayını aç`}
          className="-mx-1 cursor-pointer truncate rounded px-1 font-heading text-base font-semibold text-text transition hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-lg"
        >
          {item.name}
        </h3>
        {item.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted sm:text-sm">
            {item.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div className="flex flex-wrap gap-1">
            {item.is_new ? <Badge tone="info">Yeni</Badge> : null}
            {item.is_popular ? <Badge tone="warn">Popüler</Badge> : null}
            {item.is_featured ? <Badge tone="primary">Öne Çıkan</Badge> : null}
          </div>
          <span className="font-heading text-base font-bold text-primary sm:text-lg">
            {formatPrice(item.price, item.currency)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {/* qty selector — appears only when the item is in the cart AND
            the tenant has cart_enabled on. With cart off, only the
            chevron (opens detail drawer) is rendered so BASIC tenants
            still let customers inspect allergen / nutrition info. */}
        {cartEnabled ? (
          cartItem ? (
            <div
              role="group"
              aria-label={`${item.name} adedi`}
              className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/5 px-1 py-0.5"
            >
              <button
                type="button"
                onClick={handleDec}
                aria-label="Azalt"
                className="touch-target flex h-7 w-7 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span
                aria-live="polite"
                className="min-w-[1.5rem] text-center font-heading text-sm font-semibold tabular-nums text-primary"
              >
                {cartItem.quantity}
              </span>
              <button
                type="button"
                onClick={handleInc}
                aria-label="Arttır"
                className="touch-target flex h-7 w-7 items-center justify-center rounded-full text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              className={
                "touch-target inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 " +
                (pulse ? "animate-[pulse-add_0.6s_ease-out]" : "")
              }
            >
              {pulse ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  Eklendi
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  Sepete ekle
                </>
              )}
            </button>
          )
        ) : null}

        <button
          type="button"
          onClick={() => onSelect?.(item)}
          aria-label={`${item.name} detayını aç`}
          className="touch-target self-end rounded-full p-2 text-muted transition hover:bg-background focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <style>{`
        @keyframes pulse-add {
          0%   { transform: scale(1);    box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 16 185 129), 0.6); }
          60%  { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(var(--primary-rgb, 16 185 129), 0); }
          100% { transform: scale(1);    box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 16 185 129), 0); }
        }
      `}</style>
    </article>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "info" | "warn" | "primary";
}) {
  const tones: Record<typeof tone, string> = {
    info: "bg-blue-100 text-blue-800",
    warn: "bg-amber-100 text-amber-800",
    primary: "bg-primary/15 text-primary",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}