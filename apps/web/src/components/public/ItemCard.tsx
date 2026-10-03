"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { Check, Flame, Minus, Plus, Sparkles, Star } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { SmartImage } from "@/components/ui/SmartImage";
import { useCartStore } from "@/lib/cart-store";
import { useFeatureFlag } from "@/lib/feature-flags";
import { formatPrice } from "@/lib/format";
import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";

interface ItemCardProps {
  item: PublicMenuItem;
  category: PublicMenuCategory;
  /** Opens the detail sheet. */
  onSelect?: (item: PublicMenuItem) => void;
  /** allergen code → localised name (from the payload's allergen list). */
  allergenNames?: Record<string, string>;
}

/**
 * ItemCard — one dish, one horizontal card on every screen size.
 *
 *   ┌───────────────────────────────────────────┐
 *   │ [badges]                        ┌───────┐ │
 *   │ Dish name (serif)               │ photo │ │
 *   │ Two-line description            │       │ │
 *   │ allergens · kcal                └──(+)──┘ │
 *   │ ₺75,00                                    │
 *   └───────────────────────────────────────────┘
 *
 * - The whole card opens the detail sheet through a real <button> inside the
 *   <h3> that is stretched over the card (`stretched-link`), so the card is
 *   reachable by keyboard and screen readers. The earlier `<article onClick>`
 *   was mouse-only, which hid allergen and ingredient information from anyone
 *   not using a pointer.
 * - A dish WITHOUT a photo gets no photo slot at all: the card stays a clean
 *   typographic row (like a printed menu) instead of showing a stock
 *   placeholder. A photo that fails to load keeps its slot with a quiet icon
 *   tile, so layout never jumps.
 * - Add / stepper controls sit above the stretched link (`relative z-raised`)
 *   and keep a 44 px hit area.
 * - Heading level (h3) and the "Sepete Ekle" button name are relied on by the
 *   browser smoke tests (apps/web/e2e).
 */
export function ItemCard({
  item,
  category,
  onSelect,
  allergenNames,
}: ItemCardProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");

  const cartItem = useCartStore((s) =>
    s.items.find((i) => i.menuItemId === item.id),
  );
  const add = useCartStore((s) => s.add);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  const [justAdded, setJustAdded] = useState(false);
  const resetTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

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
    setJustAdded(true);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setJustAdded(false), 900);
  };

  const handleInc = () => {
    if (cartItem) updateQuantity(item.id, cartItem.quantity + 1);
    else handleAdd();
  };
  const handleDec = () => {
    if (cartItem) updateQuantity(item.id, cartItem.quantity - 1);
  };

  const price = formatPrice(item.price, item.currency);
  const comparePrice =
    item.compare_at_price &&
    Number.parseFloat(item.compare_at_price) > Number.parseFloat(item.price)
      ? formatPrice(item.compare_at_price, item.currency)
      : null;

  const hasImage = Boolean(item.image);
  const allergenLabels = (item.allergens ?? []).map(
    (code) => allergenNames?.[code] ?? code,
  );
  const hasBadges = item.is_featured || item.is_popular || item.is_new;

  const control = cartEnabled ? (
    <AddControl
      name={item.name}
      quantity={cartItem?.quantity ?? 0}
      justAdded={justAdded}
      onAdd={handleAdd}
      onInc={handleInc}
      onDec={handleDec}
    />
  ) : null;

  return (
    <article
      className={clsx(
        "group relative flex gap-3.5 rounded-2xl bg-surface p-3.5 shadow-card ring-1 ring-border/60",
        "transition-shadow duration-200 hover:shadow-md hover:ring-border-strong",
        "has-[.stretched-link:focus-visible]:ring-2 has-[.stretched-link:focus-visible]:ring-primary sm:p-4",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        {hasBadges ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {item.is_featured ? (
              <Badge tone="primary" icon={<Star className="h-3 w-3" aria-hidden />}>
                İmza
              </Badge>
            ) : null}
            {item.is_popular ? (
              <Badge tone="warm" icon={<Flame className="h-3 w-3" aria-hidden />}>
                Popüler
              </Badge>
            ) : null}
            {item.is_new ? (
              <Badge
                tone="success"
                icon={<Sparkles className="h-3 w-3" aria-hidden />}
              >
                Yeni
              </Badge>
            ) : null}
          </div>
        ) : null}

        <h3 className="font-heading text-[1.0625rem] font-semibold leading-snug text-text sm:text-lg">
          <button
            type="button"
            onClick={() => onSelect?.(item)}
            aria-haspopup="dialog"
            className="stretched-link line-clamp-2 cursor-pointer text-left focus-visible:outline-none"
          >
            {item.name}
          </button>
        </h3>

        {item.description ? (
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">
            {item.description}
          </p>
        ) : null}

        {allergenLabels.length > 0 || item.calories || item.spice_level > 0 ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-outline">
            {item.spice_level > 0 ? (
              <span className="inline-flex items-center gap-0.5 font-medium text-secondary">
                {Array.from({ length: Math.min(item.spice_level, 3) }).map(
                  (_, i) => (
                    <Flame key={i} className="h-3 w-3" aria-hidden />
                  ),
                )}
                <span className="sr-only">Acı seviyesi {item.spice_level}</span>
              </span>
            ) : null}
            {item.calories ? <span>{Math.round(item.calories)} kcal</span> : null}
            {allergenLabels.length > 0 ? (
              <span className="min-w-0 truncate">
                İçerir: {allergenLabels.slice(0, 3).join(", ")}
                {allergenLabels.length > 3 ? ` +${allergenLabels.length - 3}` : ""}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mt-auto flex items-baseline gap-2 pt-3">
          <span className="font-heading text-lg font-semibold tabular-nums text-primary">
            {price}
          </span>
          {comparePrice ? (
            <s className="text-sm tabular-nums text-outline">{comparePrice}</s>
          ) : null}
        </div>
      </div>

      {hasImage ? (
        <div className="relative z-raised h-[6.5rem] w-[6.5rem] shrink-0 sm:h-[7.5rem] sm:w-[7.5rem]">
          <SmartImage
            src={item.image}
            alt=""
            aria-hidden
            thumbnail
            wrapperClassName="h-full w-full rounded-xl ring-1 ring-inset ring-black/5"
            className="transition-transform duration-500 ease-out-expo group-hover:scale-105"
          />
          {control ? (
            <div className="absolute -bottom-2 -right-2">{control}</div>
          ) : null}
        </div>
      ) : control ? (
        <div className="relative z-raised flex shrink-0 items-end">{control}</div>
      ) : null}
    </article>
  );
}

/* ── Add button / quantity stepper ─────────────────────────────────────── */

interface AddControlProps {
  name: string;
  quantity: number;
  justAdded: boolean;
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
}

function AddControl({
  name,
  quantity,
  justAdded,
  onAdd,
  onInc,
  onDec,
}: AddControlProps) {
  if (quantity > 0) {
    return (
      <div
        role="group"
        aria-label={`${name} adedi`}
        className="flex h-10 items-center rounded-full bg-surface shadow-md ring-1 ring-border-strong animate-pop"
      >
        <button
          type="button"
          onClick={onDec}
          aria-label="Azalt"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary transition hover:bg-surface-low active:scale-90 before:absolute before:-inset-1 before:content-['']"
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span
          aria-live="polite"
          className="min-w-[1.25rem] text-center text-sm font-bold tabular-nums text-text"
        >
          {quantity}
        </span>
        <button
          type="button"
          onClick={onInc}
          aria-label="Arttır"
          className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary transition hover:bg-surface-low active:scale-90 before:absolute before:-inset-1 before:content-['']"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`Sepete Ekle: ${name}`}
      className={clsx(
        "relative flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md",
        "transition duration-200 hover:bg-primary/90 hover:shadow-lg active:scale-90",
        "before:absolute before:-inset-1 before:content-['']",
        justAdded && "animate-pop",
      )}
    >
      {justAdded ? (
        <Check className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      ) : (
        <Plus className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      )}
    </button>
  );
}
