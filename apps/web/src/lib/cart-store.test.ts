/**
 * Unit tests for `lib/cart-store.ts` - hydration contract.
 *
 * Run via: cd apps/web && npm run test:cart-store
 *
 * The store must NOT apply a saved cart while it is being created: the first
 * client render has to equal the server HTML (an empty cart), otherwise React
 * reports a hydration mismatch for every returning customer. `<CartHydrator />`
 * restores the saved cart afterwards with `persist.rehydrate()`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const KEY = "qr-menu-cart";
const saved = {
  state: {
    items: [{ menuItemId: 1, name: "Türk Kahvesi", price: "75.00", currency: "TRY", quantity: 2 }],
    tableNumber: "7",
  },
  version: 0,
};

// A minimal in-memory localStorage, installed BEFORE the store module loads.
// zustand's persist middleware reads `window.localStorage` (not the bare
// global), and without a `window` it silently turns persistence off - which is
// what happens during SSR - so the fake has to be reachable through `window`.
const data = new Map<string, string>([[KEY, JSON.stringify(saved)]]);
const fakeStorage = {
  getItem: (k: string) => data.get(k) ?? null,
  setItem: (k: string, v: string) => void data.set(k, String(v)),
  removeItem: (k: string) => void data.delete(k),
  clear: () => data.clear(),
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: fakeStorage },
});

const { useCartStore } = await import("./cart-store.ts");

test("a saved cart is not applied while the store is created (first render == server HTML)", () => {
  const state = useCartStore.getState();
  assert.deepEqual(state.items, []);
  assert.equal(state.totalItems(), 0);
  assert.equal(state.tableNumber, "");
  // ... and merely creating the store did not touch what was saved.
  assert.deepEqual(JSON.parse(data.get(KEY)!), saved);
});

test("rehydrate() restores the saved items and table number", async () => {
  await useCartStore.persist.rehydrate();

  const state = useCartStore.getState();
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].quantity, 2);
  assert.equal(state.totalItems(), 2);
  assert.equal(state.totalAmount(), 150);
  assert.equal(state.tableNumber, "7");
});

test("changes are persisted, but the open/closed state of the drawer is not", () => {
  useCartStore.getState().add(
    { menuItemId: 2, name: "Espresso", price: "60.00", currency: "TRY" },
    1,
  );
  assert.equal(useCartStore.getState().isOpen, true, "adding opens the drawer");

  const persisted = JSON.parse(data.get(KEY)!);
  assert.equal(persisted.state.items.length, 2);
  assert.ok(!("isOpen" in persisted.state), "isOpen must not be persisted");
});
