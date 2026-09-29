"use client";

/**
 * FeatureFlagProvider + useFeatureFlag hook — Sprint B3a.
 *
 * Server + client compatible: the helper `hasFeature()` is a pure
 * function so server components and route loaders can call it without
 * mounting React. The Provider + hooks are client-only ("use client"
 * at the top) because they use React context.
 *
 * Pattern parity with `components/theme/ThemeProvider.tsx` (Sprint 12A):
 *  - Provider renders no DOM, just hosts the context value.
 *  - Hooks throw a clear error when used outside the provider.
 *
 * Why context + not Zustand: settings are immutable per page render —
 * no need for a store, no need to subscribe. A plain context keeps
 * the consumer tree simple and avoids the hydration dance we have to
 * do for the theme store.
 */

import { createContext, useContext, useMemo } from "react";

import type {
  FeatureFlagContextValue,
  FeatureName,
  PublicSettings,
} from "@/types/public";

import { hasFeature } from "./feature-flags-helpers";

// Re-export the pure helper so existing call sites
// (`import { hasFeature } from "@/lib/feature-flags"`) keep working
// unchanged. The actual implementation lives in
// `feature-flags-helpers.ts` so the Node `--experimental-strip-types`
// test runner can import it without a JSX-aware loader.
export { hasFeature };

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface FeatureFlagProviderProps {
  /** Loaded public settings. `null` when the tenant fetch failed —
   *  hasFeature() returns `false` for every flag in that case so the
   *  UI degrades to the safest variant. */
  settings: PublicSettings | null;
  children: React.ReactNode;
}

/**
 * Wraps a subtree with the feature-flag context. Pass the server-fetched
 * `PublicSettings` once at the page root — descendant components can
 * then call `useFeatureFlag('cart_enabled')` without re-fetching.
 */
export function FeatureFlagProvider({
  settings,
  children,
}: FeatureFlagProviderProps) {
  // `useMemo` keeps the context value stable across renders when
  // `settings` is referentially stable. Server components pass a
  // freshly-fetched object on every render, but the provider only
  // runs on the client (hydration + subsequent re-renders), so the
  // memoization avoids spurious consumer re-runs.
  //
  // The single-arg `hasFeature` closes over the provider's `settings`
  // so consumers can do `ctx.hasFeature('cart_enabled')` without
  // re-stating the settings argument.
  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      settings,
      hasFeature: (feature: FeatureName) => hasFeature(settings, feature),
    }),
    [settings],
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Read the full settings object from the provider. Returns `null` when
 * the provider hasn't loaded settings (or the tenant fetch failed).
 * Prefer `useFeatureFlag` for single-flag checks — it short-circuits
 * and reads more cleanly at the call site.
 */
export function useFeatureFlags(): PublicSettings | null {
  const ctx = useContext(FeatureFlagContext);
  if (ctx === null) {
    throw new Error(
      "useFeatureFlags() must be used inside <FeatureFlagProvider>. " +
        "Wrap your page or component in <FeatureFlagProvider settings={...}>.",
    );
  }
  return ctx.settings;
}

/**
 * Read a single feature flag. Returns `false` when:
 *   - the provider is missing (throw — clear bug, see below)
 *   - settings haven't loaded
 *   - settings loaded but the flag is off
 *
 * Throws when called outside the provider. The thrown message names
 * the provider so the fix is obvious in a V1 demo environment.
 */
export function useFeatureFlag(feature: FeatureName): boolean {
  const ctx = useContext(FeatureFlagContext);
  if (ctx === null) {
    throw new Error(
      `useFeatureFlag('${feature}') must be used inside <FeatureFlagProvider>. ` +
        `Wrap your page or component in <FeatureFlagProvider settings={...}>.`,
    );
  }
  return ctx.hasFeature(feature);
}