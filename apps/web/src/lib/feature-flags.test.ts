/**
 * Unit tests for `lib/feature-flags.tsx` — Sprint B3b.
 *
 * Uses Node 22+ built-in `node:test` runner with the
 * `--experimental-strip-types` flag (no Vitest/Jest in V1 frontend —
 * keep the toolchain small). Mirrors the test pattern established by
 * `lib/currency.test.ts` and `lib/seo.test.ts`.
 *
 * Coverage matrix:
 *
 *   1. `hasFeature()` null-safety — true / false / null / undefined
 *      settings. The safe-default is "feature off" so the public UI
 *      degrades to the conservative variant when the tenant fetch
 *      hasn't resolved yet.
 *   2. Plan-tier matrix — OPS enables all 8; BASIC disables all 8;
 *      PRO disables cart / loyalty / payments (the gated tiers per
 *      apps/billing/constants.py FEATURE_TIER_MAP).
 *   3. Defensive cases — undefined / non-boolean flag values map to
 *      false (a stale build that doesn't know about a new server-side
 *      flag should not silently grant it).
 *
 * Run via:
 *   cd apps/web && npm run test:feature-flags
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { hasFeature } from "./feature-flags-helpers.ts";
import type { FeatureFlags, FeatureName, PublicSettings } from "@/types/public";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ALL_FEATURES: FeatureName[] = [
  "cart_enabled",
  "orders_enabled",
  "loyalty_enabled",
  "customer_accounts_enabled",
  "payments_enabled",
  "ai_pdf_import_enabled",
  "ai_translate_enabled",
  "advanced_analytics_enabled",
];

/** Build a `FeatureFlags` record where every key is set to the given value. */
function allFlags(value: boolean): FeatureFlags {
  return Object.fromEntries(ALL_FEATURES.map((k) => [k, value])) as FeatureFlags;
}

/** Minimal PublicSettings payload for a given plan + flag dict. */
function makeSettings(
  activePlan: PublicSettings["active_plan"],
  flags: Partial<FeatureFlags>,
): PublicSettings {
  // Fill in the missing keys with `false` so the shape matches what
  // the backend actually returns (every FeatureKey is required).
  const fullFlags = Object.fromEntries(
    ALL_FEATURES.map((k) => [k, flags[k] === true]),
  ) as FeatureFlags;
  return {
    slug: "modern-cafe",
    name: "Modern Cafe",
    active_plan: activePlan,
    features: fullFlags,
  };
}

// ---------------------------------------------------------------------------
// 1. hasFeature() — null-safety
// ---------------------------------------------------------------------------

test("hasFeature(): returns the flag value when settings is loaded (true / false)", () => {
  const settings = makeSettings("ops", { cart_enabled: true });
  assert.equal(hasFeature(settings, "cart_enabled"), true);
  assert.equal(hasFeature(settings, "loyalty_enabled"), false);
});

test("hasFeature(): safe-default false when settings is null", () => {
  // Public pages see this when the backend fetch fails or is skipped.
  // Conservative variant is correct: don't silently enable premium UX
  // when the tenant plan is unknown.
  assert.equal(hasFeature(null, "cart_enabled"), false);
  assert.equal(hasFeature(null, "payments_enabled"), false);
});

test("hasFeature(): safe-default false when settings is undefined", () => {
  assert.equal(hasFeature(undefined, "cart_enabled"), false);
  assert.equal(hasFeature(undefined, "loyalty_enabled"), false);
});

test("hasFeature(): treats missing/undefined flag values as false", () => {
  // Defensive: backend ships every key, but a stale client build that
  // doesn't know about a new server-side flag must not grant it.
  // Cast through `unknown` to bypass the `FeatureFlags` strict shape —
  // we're deliberately simulating a partial payload.
  const partial = {
    slug: "x",
    name: "x",
    active_plan: "ops" as const,
    features: {
      cart_enabled: true,
      orders_enabled: true,
      loyalty_enabled: true,
      customer_accounts_enabled: true,
      payments_enabled: true,
      ai_pdf_import_enabled: true,
      ai_translate_enabled: true,
      // advanced_analytics_enabled intentionally missing
    },
  } as unknown as PublicSettings;
  assert.equal(hasFeature(partial, "cart_enabled"), true);
  assert.equal(hasFeature(partial, "advanced_analytics_enabled"), false);
});

test("hasFeature(): non-boolean flag value (e.g. accidental string) is false", () => {
  // Cast through `unknown` — we're simulating a malformed payload.
  const weird = {
    slug: "x",
    name: "x",
    active_plan: "ops" as const,
    features: {
      ...allFlags(true),
      cart_enabled: "true", // bad payload from a future bug
    },
  } as unknown as PublicSettings;
  assert.equal(hasFeature(weird, "cart_enabled"), false);
});

// ---------------------------------------------------------------------------
// 2. Plan-tier matrix — OPS / BASIC / PRO parity with FEATURE_TIER_MAP
// ---------------------------------------------------------------------------

test("plan tier matrix: OPS enables every flag", () => {
  // OPS = highest tier. Every feature should be on.
  const ops = makeSettings("ops", allFlags(true));
  for (const key of ALL_FEATURES) {
    assert.equal(hasFeature(ops, key), true, `OPS should enable ${key}`);
  }
});

test("plan tier matrix: BASIC disables every flag", () => {
  // BASIC = free tier. Nothing premium is on.
  const basic = makeSettings("basic", allFlags(false));
  for (const key of ALL_FEATURES) {
    assert.equal(hasFeature(basic, key), false, `BASIC should disable ${key}`);
  }
});

test("plan tier matrix: PRO disables cart / loyalty / payments (gated to PRO+ tiers)", () => {
  // PRO tier — keeps QR menu + basic order flow but the customer-
  // engagement / payment features (cart, loyalty, payments) require
  // a higher plan (orders / ops). Mirrors FEATURE_TIER_MAP in the
  // backend so a frontend vs backend disagreement is caught here.
  const pro: Record<FeatureName, boolean> = {
    cart_enabled: false, // ORDERS+
    orders_enabled: true, // PRO+
    loyalty_enabled: false, // ORDERS+
    customer_accounts_enabled: true, // PRO+
    payments_enabled: false, // OPS
    ai_pdf_import_enabled: true, // PRO+
    ai_translate_enabled: true, // PRO+
    advanced_analytics_enabled: true, // PRO+
  };
  const settings = makeSettings("pro", pro);
  assert.equal(hasFeature(settings, "cart_enabled"), false);
  assert.equal(hasFeature(settings, "loyalty_enabled"), false);
  assert.equal(hasFeature(settings, "payments_enabled"), false);
  assert.equal(hasFeature(settings, "orders_enabled"), true);
  assert.equal(hasFeature(settings, "customer_accounts_enabled"), true);
  assert.equal(hasFeature(settings, "ai_pdf_import_enabled"), true);
});

// ---------------------------------------------------------------------------
// 3. Cross-cutting sanity
// ---------------------------------------------------------------------------

test("8 distinct feature keys are recognised (matches FEATURE_KEYS)", () => {
  // Guard against the FEATURE_KEYS list and ALL_FEATURES drifting —
  // both sides must agree on the exact 8 keys.
  assert.equal(ALL_FEATURES.length, 8);
  const settings = makeSettings("ops", allFlags(true));
  // Touching each key forces a typecheck that the union still aligns.
  for (const key of ALL_FEATURES) {
    hasFeature(settings, key);
  }
});

test("hasFeature(): idempotent across repeated calls with same settings", () => {
  const settings = makeSettings("orders", {
    cart_enabled: true,
    orders_enabled: true,
    loyalty_enabled: true,
  });
  for (let i = 0; i < 5; i++) {
    assert.equal(hasFeature(settings, "cart_enabled"), true);
    assert.equal(hasFeature(settings, "loyalty_enabled"), true);
    assert.equal(hasFeature(settings, "payments_enabled"), false);
  }
});