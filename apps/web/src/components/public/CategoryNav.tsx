"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { PublicMenuCategory } from "@/types/menu";

interface CategoryNavProps {
  categories: PublicMenuCategory[];
}

/**
 * CategoryNav — Velouté sticky segmented pill track (D-035 / Sprint G).
 *
 * Desktop: an elevated white track (`bg-surface`) sits over the linen
 * page bg. Active pill is `bg-primary text-primary-foreground`; inactive
 * pills are subtle `bg-[var(--color-surface-low)]` that flip to forest on
 * hover. 44px min-height on every chip.
 *
 * Mobile: same look, slightly smaller padding so 5-6 categories fit on a
 * 360px viewport.
 *
 * IntersectionObserver picks the section with the largest visible area
 * inside the top 56px + bottom-55% band (matches the sticky chrome
 * height + the natural reading zone).
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(
    categories[0]?.slug ?? null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-category-anchor]"),
    );
    if (sections.length === 0) return;

    // rootMargin = "-{sticky-chrome}px 0px -{bottom-half}px 0px".
    // We pick sections whose visible middle intersects the reading
    // zone (top 50px) so the chip follows the user's reading line.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const slug = visible[0].target.getAttribute(
            "data-category-anchor",
          );
          if (slug) setActiveSlug(slug);
        }
      },
      {
        // top - sticky header (48px) - sticky pill row (~40px) = -88px on sm+
        // mobile: -48px (header only)
        rootMargin:
          typeof window !== "undefined" && window.innerWidth >= 640
            ? "-88px 0px -55% 0px"
            : "-48px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  if (categories.length === 0) return null;

  return (
    <nav
      aria-label="Kategoriler"
      className="sticky top-12 z-20 -mx-3 mt-3 border-b border-[var(--color-border)] bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:top-14 sm:-mx-6 sm:mt-6 sm:px-6"
    >
      <div className="flex flex-1 snap-x snap-mandatory items-center gap-1.5 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2 sm:py-3">
        {categories.map((cat) => {
          const isActive = cat.slug === activeSlug;
          return (
            <a
              key={cat.id}
              href={`#category-${cat.slug}`}
              aria-current={isActive ? "true" : undefined}
              className={clsx(
                "inline-flex min-h-[36px] shrink-0 snap-start items-center rounded-pill px-3 text-xs font-semibold uppercase tracking-wider transition focus:outline-none focus:ring-2 focus:ring-primary sm:min-h-[44px] sm:px-4 sm:text-sm",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-[var(--color-surface-low)] text-on-surface-variant hover:bg-[var(--color-surface)] hover:text-text",
              )}
            >
              {cat.name}
              <span
                className={clsx(
                  "ml-2 rounded-pill px-1.5 py-0.5 text-[10px] font-bold",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-[var(--color-surface)] text-outline",
                )}
              >
                {cat.items.length}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
