"use client";

import clsx from "clsx";
import { useEffect, useRef } from "react";

import type { PublicMenuCategory } from "@/types/menu";

interface CategoryNavProps {
  categories: PublicMenuCategory[];
  /** Slug of the section the reader is on (from `useCategorySpy`). */
  activeSlug: string | null;
}

/**
 * CategoryNav — sticky chip row for phones and tablets.
 *
 * The bar is full width (so the glass background reaches both screen edges)
 * and the chips live in an inner scroller with its own padding. The earlier
 * version used negative margins to fake this, which pushed the page ~13 px
 * wider than the screen on phones.
 *
 * The active chip follows the reader: as sections scroll past, the chip row
 * scrolls horizontally to keep the active one centred.
 *
 * Hidden from `lg`: the desktop layout has the category rail instead.
 */
export function CategoryNav({ categories, activeSlug }: CategoryNavProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Keep the active chip centred inside the scroller. Scrolling the scroller
  // itself (not `scrollIntoView`) avoids dragging the whole page with it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !activeSlug) return;
    const chip = scroller.querySelector<HTMLElement>(
      `[data-chip="${CSS.escape(activeSlug)}"]`,
    );
    if (!chip) return;
    const target = chip.offsetLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [activeSlug]);

  if (categories.length === 0) return null;

  return (
    <nav
      aria-label="Kategoriler"
      data-category-nav
      className="glass sticky top-[var(--header-h)] z-nav border-b border-border/70 lg:hidden"
    >
      <div
        ref={scrollerRef}
        className="no-scrollbar mx-auto flex max-w-6xl snap-x items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6"
      >
        {categories.map((cat) => {
          const isActive = cat.slug === activeSlug;
          return (
            <a
              key={cat.id}
              data-chip={cat.slug}
              href={`#category-${cat.slug}`}
              aria-current={isActive ? "true" : undefined}
              className={clsx(
                "inline-flex h-10 shrink-0 snap-start items-center rounded-pill px-4 text-sm font-semibold",
                "transition-[background-color,color,box-shadow] duration-200",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-surface-low text-muted hover:bg-surface-high hover:text-text",
              )}
            >
              {cat.name}
            </a>
          );
        })}
        {/* Trailing spacer so the last chip can scroll fully clear of the edge. */}
        <span aria-hidden className="w-2 shrink-0" />
      </div>
    </nav>
  );
}
