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

// ---------------------------------------------------------------------------
// Compliance / mevzuat fields (Sprint D1a — D-031)
//
// Mirror of the 6 MenuItem fields added by Sprint D1 in the backend
// (calories, portion_size, ingredients, legal_notes, contains_alcohol,
// is_halal). Exposed by `apps.menu.services.visibility.build_items_payload`
// and consumed by:
//   - `<ItemDetailDrawer>` — mevzuat badge rendering on the public menu page
//   - `/m/[slug]/print`  — A4 printable export of the menu (Sprint D2)
//   - the future SaaS PDF endpoint (Sprint D2 backend, V2)
//
// `null` / empty strings are explicitly allowed on the wire; the UI hides
// individual badges when their source field is missing. This matches the
// backend's "optional compliance data, never blocks menu publish" policy.
// ---------------------------------------------------------------------------

/**
 * `ComplianceFields` — the subset of MenuItem attributes that satisfy
 * Türk Gıda Kodeksi / etiket yönetmeliği disclosure requirements.
 *
 * All fields are optional because compliance disclosure is opt-in per
 * tenant — a freshly seeded tenant has none of them populated.
 */
export interface ComplianceFields {
  /** Calories per serving (positive int, kcal). */
  calories?: number | null;
  /** Human-readable portion size ("250g", "1 porsiyon", "350 ml"). */
  portion_size?: string;
  /** Free-text ingredients list ("Buğday unu, şeker, tereyağı, ..."). */
  ingredients?: string;
  /** Free-text allergen / warning notes ("Fıstık içerir", "Süt izi"). */
  legal_notes?: string;
  /** When true, surfaces an amber "🍷 Alkol içerir" callout in the drawer
   *  and the print page. False / null suppresses the callout. */
  contains_alcohol?: boolean;
  /** Tri-state halal flag:
   *    true  → green "Helal" badge
   *    false → red   "Helal Değil" badge
   *    null  → badge suppressed (tenant hasn't disclosed) */
  is_halal?: boolean | null;
}

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
 * `hasFeature` (single-arg — settings come from the provider scope) and
 * `useFeatureFlag` both stay null-safe in that case.
 *
 * For the standalone 2-arg helper used outside the provider (server
 * components, pure logic), import `hasFeature` directly from
 * `lib/feature-flags`.
 */
export interface FeatureFlagContextValue {
  /** Loaded settings, or `null` if the fetch failed / was skipped. */
  settings: PublicSettings | null;
  /** Single-arg variant — closes over the provider's `settings`. */
  hasFeature: (feature: FeatureName) => boolean;
}