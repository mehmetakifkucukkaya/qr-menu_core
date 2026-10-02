"use client";

import { useEffect } from "react";

import { useCartStore } from "@/lib/cart-store";

/**
 * CartHydrator - restores the saved cart from localStorage AFTER hydration.
 *
 * The cart store is created with `skipHydration: true` (see `lib/cart-store`):
 * server HTML and the first client render both show an empty cart, so React
 * hydrates without a mismatch; this effect then loads the saved items and the
 * header badge, floating button, drawer and "Sepete Ekle" steppers update.
 *
 * Mount it exactly once, high in the public menu tree, and BEFORE its
 * siblings: effects run in tree order, and the store writes to localStorage on
 * every change, so nothing may modify the cart before this has read it.
 * Renders nothing.
 */
export function CartHydrator() {
  useEffect(() => {
    void useCartStore.persist.rehydrate();
  }, []);
  return null;
}
