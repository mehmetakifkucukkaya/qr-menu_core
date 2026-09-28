"use client";

/**
 * Customer session store — Sprint 10B (D-025).
 *
 * The cookie (`_auth_customer_id`) is the source of truth — the server
 * reads it on every request to authorise the session. This zustand
 * store is a thin client-side cache so conditional UI (loyalty badge,
 * checkout auto-fill) doesn't need an extra round-trip.
 *
 * Hydration strategy:
 *  - The server component fetches the profile + loyalty state once and
 *    passes them into the page island as a `CustomerHydrator` prop.
 *  - The island calls `hydrate(...)` so the store has the same data the
 *    server saw.
 *  - Subsequent UI updates (profile edit, logout, etc.) flow through the
 *    store AND through server actions so the cookie stays in sync.
 *
 * NOT persisted (no localStorage) — by design:
 *  - Server source of truth is the cookie. We don't want to silently
 *    serve a stale cached profile after the user logs out / their
 *    account is suspended.
 *  - Avoids a one-frame flash of stale data on cross-tab login.
 *  - Keeps the store SSR-safe without a hydration dance.
 */

import { create } from "zustand";

import type {
  CustomerLoyaltySummary,
  CustomerProfile,
} from "@/types/account";

interface CustomerStoreState {
  profile: CustomerProfile | null;
  loyalty: CustomerLoyaltySummary | null;
  /** True once the server has responded (even if both are null). */
  loaded: boolean;

  /** Set profile (called by server-component-driven hydrate). */
  setProfile: (profile: CustomerProfile | null) => void;
  /** Set loyalty (called by server-component-driven hydrate). */
  setLoyalty: (loyalty: CustomerLoyaltySummary | null) => void;
  /** Bulk hydrate — page islands call this once on mount. */
  hydrate: (data: {
    profile: CustomerProfile | null;
    loyalty: CustomerLoyaltySummary | null;
  }) => void;
  /** Clear local cache. Server-side cookie deletion is a separate step. */
  logoutLocal: () => void;
}

export const useCustomerStore = create<CustomerStoreState>((set) => ({
  profile: null,
  loyalty: null,
  loaded: false,
  setProfile: (profile) => set({ profile, loaded: true }),
  setLoyalty: (loyalty) => set({ loyalty, loaded: true }),
  hydrate: ({ profile, loyalty }) =>
    set({ profile, loyalty, loaded: true }),
  logoutLocal: () => set({ profile: null, loyalty: null, loaded: false }),
}));

/** Convenience selector — returns the profile (or null). */
export function useCustomerProfile(): CustomerProfile | null {
  return useCustomerStore((s) => s.profile);
}

/** Convenience selector — returns the loyalty summary (or null). */
export function useCustomerLoyalty(): CustomerLoyaltySummary | null {
  return useCustomerStore((s) => s.loyalty);
}
