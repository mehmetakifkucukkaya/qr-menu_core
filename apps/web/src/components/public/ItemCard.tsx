"use client";

import { useState } from "react";
import { Plus, Check, Minus } from "lucide-react";
import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";
import { getItemPlaceholder } from "@/lib/placeholder";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { useFeatureFlag } from "@/lib/feature-flags";

interface ItemCardProps {
  item: PublicMenuItem;
  category: PublicMenuCategory;
  /** Sprint 3B-2: opens the detail drawer. Kept for backward compat — when
   *  provided, clicking the body opens detail (cart button stays a sibling
   *  flex element so it never competes for taps). */
  onSelect?: (item: PublicMenuItem) => void;
}

/**
 * ItemCard — Velouté Hospitality Suite dish card (D-035 / Sprint G).
 *
 * Desktop layout: vertical card with full-bleed cover image, dietary pill
 * row (top-left overlay), Playfair Display title + Plus Jakarta body,
 * price prominent, +44px round add button at bottom-right.
 *
 * Mobile layout: horizontal list card — text-first with a 7rem × 7rem
 * image on the right. Dietary pills above the title, price + round add
 * at the bottom.
 *
 * Touch target: add button is exactly 44×44 (mobile round button) or
 * 44px-tall row button on desktop. WCAG AAA contrast.
 */
export function ItemCard({ item, category, onSelect }: ItemCardProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");

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
    window.setTimeout(() => setPulse(false), 900);
  };

  const handleInc = () => {
    if (cartItem) updateQuantity(item.id, cartItem.quantity + 1);
    else handleAdd();
  };

  const handleDec = () => {
    if (cartItem) updateQuantity(item.id, cartItem.quantity - 1);
  };

  const isSoldOut = false; // Sold-out state reserved for V2 (catalog availability API).
  const price = formatPrice(item.price, item.currency);

  return (
    <article
      onClick={() => onSelect?.(item)}
      className={
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-surface shadow-sm transition hover:shadow-md sm:flex-row sm:gap-4 " +
        (isSoldOut ? "opacity-60" : "")
      }
    >
      {/* ── Image block ── */}
      <div className="relative h-40 w-full shrink-0 overflow-hidden bg-[var(--color-surface-low)] sm:h-40 sm:w-44 sm:rounded-l-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={item.name}
          onError={handleError}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Top-left dietary / status pill row */}
        <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          {item.is_featured ? (
            <span className="rounded-pill bg-primary/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground backdrop-blur-md">
              ⭐ İmza
            </span>
          ) : null}
          {item.is_popular ? (
            <span className="rounded-pill bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              🔥 Popüler
            </span>
          ) : null}
          {item.is_new ? (
            <span className="rounded-pill bg-[var(--color-surface)]/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">
              Yeni Sezon
            </span>
          ) : null}
        </div>
        {isSoldOut ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
            <span className="text-2xl">⛔</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Şu an tükendi
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3
            className="font-heading text-lg font-semibold leading-tight text-text transition group-hover:text-primary sm:text-xl"
          >
            {item.name}
          </h3>
          <span className="shrink-0 font-heading text-base font-bold tabular-nums text-primary sm:text-lg">
            {price}
          </span>
        </div>

        {item.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-on-surface-variant">
            {item.description}
          </p>
        ) : null}

        {/* Dietary / nutrition meta row */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {item.calories ? (
            <span className="rounded-pill bg-[var(--color-surface-low)] px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
              {Math.round(item.calories)} kcal
            </span>
          ) : null}
          {item.spice_level > 0 ? (
            <span className="rounded-pill bg-secondary/15 px-2 py-0.5 text-[10px] font-semibold text-secondary">
              🌶 Acı {item.spice_level}
            </span>
          ) : null}
          {item.allergens && item.allergens.length > 0 ? (
            <span className="rounded-pill bg-[var(--color-surface-low)] px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant">
              {item.allergens.slice(0, 3).join(" · ")}
            </span>
          ) : null}
        </div>

        {/* Footer row — Recipe link + Quick Add */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition group-hover:text-primary-container">
            Tarif Kökeni
            <span aria-hidden>→</span>
          </span>

          {cartEnabled && !isSoldOut ? (
            cartItem ? (
              <div
                role="group"
                aria-label={`${item.name} adedi`}
                className="inline-flex items-center gap-1 rounded-pill border border-primary bg-primary/5 px-1 py-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={handleDec}
                  aria-label="Azalt"
                  className="flex h-9 w-9 items-center justify-center rounded-pill text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <Minus className="h-4 w-4" aria-hidden />
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
                  className="flex h-9 w-9 items-center justify-center rounded-pill text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAdd();
                }}
                className={
                  "inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 " +
                  (pulse ? "scale-105" : "")
                }
              >
                {pulse ? (
                  <>
                    <Check className="h-4 w-4" aria-hidden />
                    Eklendi
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden />
                    Sepete Ekle
                  </>
                )}
              </button>
            )
          ) : null}
        </div>
      </div>
    </article>
  );
}
