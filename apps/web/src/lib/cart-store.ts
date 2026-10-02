"use client";

/**
 * Cart store — Sprint 8B (V2).
 *
 * Zustand-backed cart with `localStorage` persistence. Lives entirely on
 * the client; the server is the source of truth for prices / availability
 * (we post `menu_item_id` + `quantity` and let `apps.orders.services.calculate_total`
 * re-derive the total server-side).
 *
 * Why Zustand + persist?
 *  - Tiny footprint, no provider boilerplate.
 *  - `persist` middleware writes every change to localStorage.
 *
 * Hydration (read this before touching `persist` options): by default the
 * middleware reads localStorage synchronously when the store is created, so
 * the FIRST client render already sees the saved cart while the server HTML
 * was rendered with an empty one. React then reports "Hydration failed ...
 * Expected server HTML to contain a matching <span> in <button>" (header badge,
 * floating cart button, line items, "Sepete Ekle" -> quantity stepper) and
 * throws the whole boundary away in favour of client rendering. That hit every
 * returning customer who had items in their cart.
 *
 * So `skipHydration: true`: the store starts empty on server and client alike
 * and `<CartHydrator />` (mounted once in MenuViewClient) calls
 * `useCartStore.persist.rehydrate()` in an effect, i.e. after hydration.
 *
 * Schema:
 *  - `items` — line items in the cart. `quantity` is mutable from the UI
 *    (qty selector) and on add is "+qty" to the existing line if the
 *    same menuItem is already present.
 *  - `tableNumber` — prefillable from `?table=N` in the QR URL.
 *  - `isOpen` — drawer open flag (mobile floating button toggles it).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  /** Backend MenuItem PK. */
  menuItemId: number;
  name: string;
  /** Server-provided price as decimal-string (e.g. "12.50"). */
  price: string;
  currency: string;
  quantity: number;
  notes?: string;
  image?: string | null;
  categorySlug?: string;
}

interface CartState {
  items: CartItem[];
  tableNumber: string;
  isOpen: boolean;
}

interface CartActions {
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  updateQuantity: (menuItemId: number, quantity: number) => void;
  updateNotes: (menuItemId: number, notes: string) => void;
  remove: (menuItemId: number) => void;
  clear: () => void;
  setTableNumber: (n: string) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  totalItems: () => number;
  totalAmount: () => number;
}

export type CartStore = CartState & CartActions;

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      tableNumber: "",
      isOpen: false,

      add: (item, qty = 1) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.menuItemId === item.menuItemId,
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.menuItemId === item.menuItemId
                  ? { ...i, quantity: i.quantity + qty }
                  : i,
              ),
              isOpen: true,
            };
          }
          return {
            items: [...state.items, { ...item, quantity: qty }],
            isOpen: true,
          };
        }),

      updateQuantity: (id, qty) =>
        set((state) => ({
          items:
            qty <= 0
              ? state.items.filter((i) => i.menuItemId !== id)
              : state.items.map((i) =>
                  i.menuItemId === id ? { ...i, quantity: qty } : i,
                ),
        })),

      updateNotes: (id, notes) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.menuItemId === id ? { ...i, notes } : i,
          ),
        })),

      remove: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.menuItemId !== id),
        })),

      clear: () => set({ items: [] }),

      setTableNumber: (n) => set({ tableNumber: n }),

      openDrawer: () => set({ isOpen: true }),
      closeDrawer: () => set({ isOpen: false }),
      toggleDrawer: () => set((s) => ({ isOpen: !s.isOpen })),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
      totalAmount: () =>
        get().items.reduce(
          (sum, i) => sum + Number.parseFloat(i.price) * i.quantity,
          0,
        ),
    }),
    {
      name: "qr-menu-cart",
      // Persist items + tableNumber. Skip `isOpen` so a refresh never
      // leaves the drawer half-open from the previous session.
      partialize: (state) => ({
        items: state.items,
        tableNumber: state.tableNumber,
      }),
      // Do not read localStorage during the first client render (see the
      // "Hydration" note above); <CartHydrator /> restores it after hydration.
      skipHydration: true,
    },
  ),
);