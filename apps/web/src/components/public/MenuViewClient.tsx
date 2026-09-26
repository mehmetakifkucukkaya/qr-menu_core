"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  LocaleCode,
  PublicMenuAllergen,
  PublicMenuCategory,
  PublicMenuDietaryTag,
  PublicMenuItem,
} from "@/types/menu";
import { trackEvent } from "@/lib/events";
import { CategoryNav } from "./CategoryNav";
import { CategorySection } from "./CategorySection";
import { ItemDetailDrawer } from "./ItemDetailDrawer";

interface MenuViewClientProps {
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  locale: LocaleCode;
}

/**
 * MenuViewClient — owns the drawer state for the public menu page.
 *
 * Splits the page so server components can stay server-only for the
 * heavy data fetch / SEO path, while we wrap the categories grid with
 * a thin client component that wires ItemCard `onSelect` into the
 * drawer.
 *
 * Analytics (Sprint 5B):
 *   - Fires `menu_view` once when the component mounts (the page is
 *     hydrated and the user is actually looking at the menu — server
 *     fetches don't count).
 *   - Fires `qr_open` when the URL carries `?qr=<id>` (came in via a
 *     scanned QR code). Same shape as `menu_view` but tagged so the
 *     analytics dashboard can split organic vs. QR traffic.
 *   - Refs guard the `useEffect` so the events fire exactly once per
 *     page lifetime even under React's StrictMode double-invoke.
 */
export function MenuViewClient({
  categories,
  allergens,
  dietaryTags,
  locale,
}: MenuViewClientProps) {
  const [activeItem, setActiveItem] = useState<PublicMenuItem | null>(null);

  const handleSelect = useCallback((item: PublicMenuItem) => {
    setActiveItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setActiveItem(null);
  }, []);

  // Analytics: menu_view (once per mount) + qr_open (once if URL has ?qr=).
  const menuViewFired = useRef(false);
  const qrOpenFired = useRef(false);
  useEffect(() => {
    if (!menuViewFired.current) {
      menuViewFired.current = true;
      trackEvent("menu_view", { locale });
    }
    if (!qrOpenFired.current) {
      const params = new URLSearchParams(window.location.search);
      const qrParam = params.get("qr");
      if (qrParam) {
        const qrId = Number.parseInt(qrParam, 10);
        if (Number.isFinite(qrId)) {
          qrOpenFired.current = true;
          trackEvent("qr_open", { qr_id: qrId, locale });
        }
      }
    }
  }, [locale]);

  return (
    <>
      <CategoryNav categories={categories} />
      <div className="mx-auto mt-6 max-w-2xl space-y-8 px-4 pb-28 sm:pb-10">
        {categories.map((category) => (
          <CategorySection
            key={category.id}
            category={category}
            onItemSelect={handleSelect}
          />
        ))}
      </div>
      <ItemDetailDrawer
        item={activeItem}
        allergens={allergens}
        dietaryTags={dietaryTags}
        locale={locale}
        onClose={handleClose}
      />
    </>
  );
}