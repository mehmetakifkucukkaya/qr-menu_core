"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicMenuCategory } from "@/types/menu";

interface CategoryNavProps {
  categories: PublicMenuCategory[];
}

/**
 * CategoryNav — sticky horizontal-scroll category strip.
 *
 * - Sits below the BusinessHero on mobile (top-0 once stuck).
 * - Each chip is an anchor to `#category-{slug}` (CategorySection).
 * - The "active" pill tracks scroll position via IntersectionObserver.
 * - ChevronLeft/Right scroll the strip horizontally (snap-x makes
 *   touch scrolling pleasant on iOS Safari).
 *
 * Mobile-first: on small screens this is the primary navigation.
 * On `sm:` and up, the page becomes long enough that the nav is
 * still useful as a jump-menu.
 */
export function CategoryNav({ categories }: CategoryNavProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeSlug, setActiveSlug] = useState<string | null>(
    categories[0]?.slug ?? null,
  );

  // Track which category is currently in view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-category-anchor]"),
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the largest intersection ratio that is
        // currently intersecting — that is the "active" section.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => b.intersectionRatio - a.intersectionRatio,
          );
        if (visible[0]) {
          const slug = visible[0].target.getAttribute(
            "data-category-anchor",
          );
          if (slug) setActiveSlug(slug);
        }
      },
      {
        // Top offset = roughly the nav height (≈ 56px). Bottom offset
        // shrinks the "active" zone so the last visible section wins
        // near the page bottom.
        rootMargin: "-56px 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [categories]);

  const scrollBy = (delta: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: "smooth" });
  };

  if (categories.length === 0) return null;

  return (
    <nav
      aria-label="Kategoriler"
      className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70"
    >
      <div className="relative flex items-center">
        <button
          type="button"
          aria-label="Kategorileri sola kaydır"
          onClick={() => scrollBy(-200)}
          className="touch-target hidden shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface sm:inline-flex"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>

        <div
          ref={scrollerRef}
          className="flex flex-1 snap-x snap-mandatory gap-2 overflow-x-auto py-2 scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {categories.map((cat) => {
            const isActive = cat.slug === activeSlug;
            return (
              <a
                key={cat.id}
                href={`#category-${cat.slug}`}
                aria-current={isActive ? "true" : undefined}
                className={clsx(
                  "touch-target inline-flex shrink-0 snap-start items-center rounded-full px-3.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-card"
                    : "bg-surface text-text ring-1 ring-border hover:bg-background",
                )}
              >
                {cat.name}
              </a>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Kategorileri sağa kaydır"
          onClick={() => scrollBy(200)}
          className="touch-target hidden shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface sm:inline-flex"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </nav>
  );
}