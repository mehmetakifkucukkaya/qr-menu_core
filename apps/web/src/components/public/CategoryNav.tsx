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
        rootMargin: "-56px 0px -55% 0px",
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
      className="sticky top-0 z-20 -mx-4 mt-4 border-b border-[var(--color-border)] bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6 lg:mt-6"
    >
      <div className="flex flex-1 snap-x snap-mandatory items-center gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((cat) => {
          const isActive = cat.slug === activeSlug;
          return (
            <a
              key={cat.id}
              href={`#category-${cat.slug}`}
              aria-current={isActive ? "true" : undefined}
              className={clsx(
                "inline-flex min-h-[44px] shrink-0 snap-start items-center rounded-pill px-4 text-sm font-semibold uppercase tracking-wider transition focus:outline-none focus:ring-2 focus:ring-primary",
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
