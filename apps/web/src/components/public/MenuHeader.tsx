"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

import type { LocaleCode, PublicMenuBusiness } from "@/types/menu";
import { AccountHeaderChip } from "./AccountHeaderChip";
import { BusinessMark } from "./BusinessMark";
import { HeaderCartIcon } from "./HeaderCartIcon";
import { LocaleSelector } from "./LocaleSelector";

interface MenuHeaderProps {
  business: PublicMenuBusiness;
  locale: LocaleCode;
  headerInitial?: { id: number; email: string; full_name: string } | null;
  headerLoyaltyBalance?: number;
}

/**
 * MenuHeader — the sticky top bar of the public menu.
 *
 * At the top of the page it is transparent and floats over the hero's cover
 * (its negative bottom margin pulls the hero up underneath it), carrying only
 * the round glass controls. Once the reader scrolls it turns into a frosted
 * bar and the venue's mark + name slide in on the left — the page title has
 * left the screen by then, so the bar takes over the identity.
 *
 * The scrolled state comes from an IntersectionObserver on a sentinel at the
 * very top of the document: no scroll listener, no layout reads.
 */
export function MenuHeader({
  business,
  locale,
  headerInitial,
  headerLoyaltyBalance,
}: MenuHeaderProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* Absolutely positioned against the document: it leaves the viewport
          once the page has scrolled ~6rem. */}
      <div
        ref={sentinelRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-24 w-px"
      />
      <header
        data-menu-header
        data-scrolled={scrolled}
        className={clsx(
          "sticky top-0 z-header -mb-[var(--header-h)] h-[var(--header-h)]",
          "transition-[background-color,box-shadow] duration-300",
          scrolled
            ? "glass shadow-[0_1px_0_rgb(var(--color-border))]"
            : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-3 sm:px-6">
          {/* The h1 below carries the name for assistive tech; this copy is
              purely visual, so it stays out of the accessibility tree. */}
          <div
            aria-hidden
            className={clsx(
              "flex min-w-0 items-center gap-2.5 transition duration-300 ease-out-expo",
              scrolled
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-1 opacity-0",
            )}
          >
            <BusinessMark
              name={business.name}
              logo={business.logo}
              className="h-8 w-8 rounded-lg bg-surface ring-1 ring-border"
              initialClassName="text-sm"
            />
            <span className="truncate font-heading text-base font-semibold text-text">
              {business.name}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <LocaleSelector current={locale} />
            <div className="hidden sm:block">
              <AccountHeaderChip
                initialProfile={headerInitial}
                initialLoyaltyBalance={headerLoyaltyBalance}
              />
            </div>
            <HeaderCartIcon />
          </div>
        </div>
      </header>
    </>
  );
}
