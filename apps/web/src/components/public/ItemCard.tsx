"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";
import { getItemPlaceholder } from "@/lib/placeholder";
import { formatPrice } from "@/lib/format";

interface ItemCardProps {
  item: PublicMenuItem;
  category: PublicMenuCategory;
  onSelect?: (item: PublicMenuItem) => void;
}

/**
 * ItemCard — minimal V1 card (image + name + price + "tükendi" badge when
 * unavailable). Drawer opening logic is wired in Sprint 3B Part 2 via
 * `onSelect`; until then the card is keyboard-focusable but inert.
 */
export function ItemCard({ item, category, onSelect }: ItemCardProps) {
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
        <h3 className="truncate font-heading text-base font-semibold text-text sm:text-lg">
          {item.name}
        </h3>
        {item.description ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted sm:text-sm">
            {item.description}
          </p>
        ) : null}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div className="flex flex-wrap gap-1">
            {item.is_new ? (
              <Badge tone="info">Yeni</Badge>
            ) : null}
            {item.is_popular ? (
              <Badge tone="warn">Popüler</Badge>
            ) : null}
            {item.is_featured ? (
              <Badge tone="primary">Öne Çıkan</Badge>
            ) : null}
          </div>
          <span className="font-heading text-base font-bold text-primary sm:text-lg">
            {formatPrice(item.price, item.currency)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onSelect?.(item)}
        aria-label={`${item.name} detayını aç`}
        className="touch-target self-center rounded-full p-2 text-muted transition hover:bg-background focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
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
