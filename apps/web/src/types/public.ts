/**
 * TypeScript mirror of the public billing/feature-flag REST surface
 * (Sprint B3 backend).
 *
 * The backend is the source of truth — if a field shape changes there,
 * mirror it here on the same commit so the contract stays unambiguous.
 *
 * Convention parity with `types/menu.ts` and `types/admin.ts`:
 *  - All API envelopes use `{ data, meta? }` for success.
 *  - The meta block here carries `version: "v1"` (per
 *    `PublicSettingsView`); callers can ignore it for now.
 *  - Plan keys are the same union as the admin `Plan` type — kept
 *    distinct here (`PlanTier`) so the public-facing reader can grow
 *    surface (e.g. a marketing-only `free` tier) without forcing a
 *    rename of the admin type.
 */

import type { FeatureKey, Plan } from "@/types/admin";

// ---------------------------------------------------------------------------
// Plan tier + feature flag keys (mirrors apps.billing.constants)
// ---------------------------------------------------------------------------

/**
 * Public-facing plan tier key. Mirrors `apps.billing.constants.PLAN_TIER_ORDER`
 * (`basic`, `pro`, `orders`, `ops`). Kept as a separate type alias from the
 * admin `Plan` so the public surface can evolve (e.g. add a `free` preview
 * tier) without rippling through the admin codebase.
 */
export type PlanTier = Plan;

// Re-export the feature-flag union under its public-side name so callers
// don't need to reach into the admin types module just to render a banner.
// `FeatureName` reads better than `FeatureKey` in client-side flag checks
// (`useFeatureFlag("cart_enabled")` vs `useFeatureFlag(cart_enabled)`).
export type FeatureName = FeatureKey;

/** Single feature-flag record — every key from `FeatureName` is required. */
export type FeatureFlags = Record<FeatureName, boolean>;

// ---------------------------------------------------------------------------
// API envelope + payload
// ---------------------------------------------------------------------------

/**
 * Payload returned by `GET /api/v1/public/settings/<slug>/`.
 *
 * Mirrors `services.get_public_settings` (backend). The backend drops
 * internal fields (`billing_notes`, FK, timestamps) and only exposes
 * `slug`, `name`, `active_plan`, and the 8 boolean `features`.
 *
 * `slug` is included so a single `PublicSettings` can be displayed in
 * error toasts / banners without the caller re-passing the slug around.
 */
export interface PublicSettings {
  slug: string;
  name: string;
  active_plan: PlanTier;
  features: FeatureFlags;
}

/** Envelope wrapping a successful public response. */
export interface PublicEnvelope<T> {
  data: T;
  meta?: { version?: "v1"; request_id?: string };
}

// ---------------------------------------------------------------------------
// React context shape (consumed by `lib/feature-flags.tsx`)
// ---------------------------------------------------------------------------

/**
 * Value exposed by `FeatureFlagProvider`. `settings` may be `null` when
 * the tenant settings could not be loaded (e.g. 404 swallowed upstream);
 * `hasFeature` and `useFeatureFlag` both stay null-safe in that case.
 */
export interface FeatureFlagContextValue {
  /** Loaded settings, or `null` if the fetch failed / was skipped. */
  settings: PublicSettings | null;
  /** Pure helper — exported separately so server components can call
   *  it without mounting the provider. */
  hasFeature: (feature: FeatureName) => boolean;
}