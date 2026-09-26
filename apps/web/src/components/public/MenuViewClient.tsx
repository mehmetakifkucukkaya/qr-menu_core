"use client";

import { useState, useCallback } from "react";
import type {
  LocaleCode,
  PublicMenuAllergen,
  PublicMenuCategory,
  PublicMenuDietaryTag,
  PublicMenuItem,
} from "@/types/menu";
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