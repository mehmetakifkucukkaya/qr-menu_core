/**
 * Onboarding API client — Sprint C3b (D-030 follow-up).
 *
 * Five endpoints backing the wizard's steps 2-5 + the
 * `TrialBanner` data feed:
 *
 *   - `POST /api/v1/onboarding/preferences/` — persist the step-2
 *                                             choices (default language,
 *                                             supported languages,
 *                                             currency). The tenant
 *                                             already exists at this
 *                                             point (step 1 created
 *                                             it), so these values
 *                                             could not ride along with
 *                                             the signup payload.
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

import { adminFetch, fetchCsrfToken } from "@/lib/api-admin";
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

/** Body of POST /api/v1/onboarding/preferences/. */
export interface OnboardingPreferencesPayload {
  /** The language a customer sees first when they open the QR menu. */
  default_locale: string;
  /** Every language the tenant serves. Must contain `default_locale`. */
  supported_locales: string[];
  /** TRY / EUR / USD / GBP. */
  currency: string;
}

/** Response of POST /api/v1/onboarding/preferences/. */
export interface OnboardingPreferencesResponse {
  default_locale: string;
  supported_locales: string[];
  currency: string;
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
 * POST /api/v1/onboarding/preferences/ — persist the wizard's step 2.
 *
 * The tenant already exists (step 1 created it and signed the operator
 * in), so the languages and the currency are written here instead of
 * riding along with the signup payload. Without this the choices were
 * shown on the summary screen and then dropped.
 */
export async function saveOnboardingPreferences(
  payload: OnboardingPreferencesPayload,
  options: OnboardingFetchOptions = {},
): Promise<OnboardingPreferencesResponse> {
  return adminFetch<OnboardingPreferencesResponse>("/api/v1/onboarding/preferences", {
    method: "POST",
    body: payload,
    ...options,
  });
}

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

// ---------------------------------------------------------------------------
// Browser-side CSRF
// ---------------------------------------------------------------------------

/**
 * The wizard's writes happen in the browser, and Django enforces CSRF on
 * every session-authenticated POST: without an `X-CSRFToken` header the
 * request is answered with 403 ("CSRF token missing") even though the
 * session cookie is perfectly valid. The other admin screens get the
 * token from a server component that reads the cookie; the wizard has no
 * server component between the click and the request, so it asks for one.
 *
 * The token is cached per page load: Django rotates it on login and
 * accepts the same value for every later request, so one fetch covers
 * the wizard's three writes (preferences, complete, first QR).
 */
let cachedCsrfToken: string | null = null;

async function browserCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  cachedCsrfToken = await fetchCsrfToken();
  return cachedCsrfToken;
}

/**
 * Run an onboarding write from the browser with a CSRF token attached.
 *
 * The caller's own options win: a server component that already has a
 * token (or a forwarded cookie header) must not have it overwritten.
 */
export async function onboardingWrite<T>(
  run: (csrfToken: string) => Promise<T>,
  options: OnboardingFetchOptions = {},
): Promise<T> {
  if (options.csrfToken) return run(options.csrfToken);
  const csrfToken = await browserCsrfToken();
  return run(csrfToken);
}

/** Drop the cached token — used by the tests and after a 403. */
export function resetOnboardingCsrfToken(): void {
  cachedCsrfToken = null;
}
