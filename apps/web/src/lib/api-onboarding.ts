/**
 * Onboarding API client — Sprint C3b (D-030 follow-up).
 *
 * Four endpoints backing the wizard's steps 3-5 + the
 * `TrialBanner` data feed:
 *
 *   - `POST /api/v1/onboarding/complete/`  — materialize the wizard's
 *                                             first category + items.
 *   - `POST /api/v1/onboarding/demo-seed/`  — copy Modern Cafe template
 *                                             into the new tenant
 *                                             (idempotent).
 *   - `POST /api/v1/qr-codes/first/`        — bootstrap the first QR
 *                                             for the tenant
 *                                             (idempotent — returns the
 *                                             existing one on subsequent
 *                                             calls).
 *   - `GET  /api/v1/onboarding/trial-status/` — `TrialBanner` data feed
 *                                              (`days_remaining`).
 *
 * All endpoints are CSRF-required (the wizard runs inside an
 * authenticated session, courtesy of the signup-time `login()` helper).
 * The browser uses `credentials: "include"` + `X-CSRFToken` echo; the
 * server-side fetch path passes the cookie header explicitly. Reuses
 * `adminFetch<T>` from `lib/api-admin.ts` — no duplicate fetch plumbing.
 */

import { adminFetch } from "@/lib/api-admin";
import type { AdminFetchOptions } from "@/lib/api-admin";

// ---------------------------------------------------------------------------
// Options — narrowed from AdminFetchOptions. The onboarding endpoints are
// JSON-only and require CSRF for unsafe methods. Server components don't
// need a csrf token (the session cookie itself authenticates + Django's
// CSRF middleware trusts same-origin RSC requests), but the typed
// wrapper accepts one for symmetry with the rest of the admin client.
// ---------------------------------------------------------------------------

export type OnboardingFetchOptions = Pick<
  AdminFetchOptions,
  "baseUrl" | "internal" | "cookieHeader" | "csrfToken"
>;

// ---------------------------------------------------------------------------
// Types — match Sprint C3 backend serializers (onboarding/serializers.py).
// ---------------------------------------------------------------------------

/** A single menu item payload for POST /api/v1/onboarding/complete/. */
export interface OnboardingItemPayload {
  name: string;
  /** Decimal-as-string so we don't lose trailing zeros ("85,00"). */
  price: string;
  description?: string;
}

/** Body of POST /api/v1/onboarding/complete/. */
export interface OnboardingCompletePayload {
  category_name: string;
  category_icon?: string;
  items?: OnboardingItemPayload[];
  /** Operator skipped step 4 — create the category but no items. */
  skip_items?: boolean;
}

/** Response of POST /api/v1/onboarding/complete/. */
export interface OnboardingCompleteResponse {
  category_id: number;
  category_name: string;
  items_count: number;
}

/** Response of POST /api/v1/onboarding/demo-seed/. */
export interface DemoSeedResponse {
  categories_copied: number;
  items_copied: number;
  /** True when the tenant already had categories — nothing was copied. */
  skipped: boolean;
}

/** Response of POST /api/v1/qr-codes/first/. */
export interface FirstQRResponse {
  id: number;
  slug: string;
  /** May be empty string for V1 (PNG rendering happens in the admin UI). */
  png_url: string;
  /** Absolute URL of the menu the QR points at, e.g. `https://host/m/cafe-a`. */
  target_url: string;
}

/** Response of GET /api/v1/onboarding/trial-status/. */
export interface TrialStatus {
  in_trial: boolean;
  /** Active plan code (`basic`, `pro`, `orders`, `ops`). */
  plan: string;
  /** ISO timestamp when the trial window opened — null when not in trial. */
  trial_started_at: string | null;
  /** ISO timestamp when the trial window closes — null when not in trial. */
  trial_ends_at: string | null;
  /** Whole days remaining (0 once the window closes — caller checks `in_trial`). */
  days_remaining: number | null;
}

// ---------------------------------------------------------------------------
// Wrappers
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/onboarding/complete/ — wizard step 3-4 materialization.
 *
 * Materializes the operator's first category + items into a real menu
 * (atomic, tenant-scoped). The backend flips `Organization.menu_set`
 * lazily — this is the FIRST menu write for any new tenant.
 *
 * The browser must pass `csrfToken` (obtained via `fetchCsrfToken()`).
 * Server components can pass `internal: true` + the forwarded cookie
 * header and skip CSRF (Django's middleware trusts same-origin RSC).
 */
export async function completeOnboarding(
  payload: OnboardingCompletePayload,
  options: OnboardingFetchOptions = {},
): Promise<OnboardingCompleteResponse> {
  return adminFetch<OnboardingCompleteResponse>("/api/v1/onboarding/complete", {
    method: "POST",
    body: payload,
    ...options,
  });
}

/**
 * POST /api/v1/onboarding/demo-seed/ — Modern Cafe idempotent import.
 *
 * First call: copies Modern Cafe's published categories + items into a
 * fresh tenant menu. Subsequent calls: `skipped: true`, no-op.
 */
export async function importDemoTemplate(
  options: OnboardingFetchOptions = {},
): Promise<DemoSeedResponse> {
  return adminFetch<DemoSeedResponse>("/api/v1/onboarding/demo-seed", {
    method: "POST",
    ...options,
  });
}

/**
 * POST /api/v1/qr-codes/first/ — bootstrap the first QR for the tenant.
 *
 * Idempotent — the wizard can call this twice (e.g. user reloads the
 * Step 5 success screen) and gets the same QR id back.
 */
export async function generateFirstQR(
  options: OnboardingFetchOptions = {},
): Promise<FirstQRResponse> {
  return adminFetch<FirstQRResponse>("/api/v1/qr-codes/first", {
    method: "POST",
    ...options,
  });
}

/**
 * GET /api/v1/onboarding/trial-status/ — `TrialBanner` data feed.
 *
 * `null`-safe at the call site: when the tenant has no organization,
 * the backend returns 403 and the wrapper throws `AdminApiError`.
 * The `TrialBanner` accepts `status: TrialStatus | null` so the layout
 * can pre-fetch and pass `null` on fetch failure.
 */
export async function fetchTrialStatus(
  options: OnboardingFetchOptions = {},
): Promise<TrialStatus> {
  return adminFetch<TrialStatus>("/api/v1/onboarding/trial-status", {
    ...options,
  });
}
