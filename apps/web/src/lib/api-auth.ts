/**
 * Auth API client — Sprint C2 (D-029-candidate).
 *
 * Public auth endpoints that drive the self-serve signup wizard:
 *   - POST /api/v1/auth/signup/     — atomic User + Organization +
 *                                      Membership(OWNER) +
 *                                      PlanSettings(BASIC) +
 *                                      auto-login
 *   - GET  /api/v1/auth/check-slug/ — real-time slug availability
 *                                      check (300ms debounced by the
 *                                      wizard UI before each request)
 *
 * Both endpoints are `AllowAny` + CSRF-exempt on the backend side
 * (Sprint C1), so callers MUST NOT send an X-CSRFToken header here.
 * The signup response sets the `qr_sessionid` cookie via Django's
 * `login()` helper, so the NEXT call (e.g. onboarding/complete/ in
 * Sprint C3) automatically becomes CSRF-required.
 *
 * Implementation reuses the existing `adminFetch<T>` envelope-tolerant
 * wrapper from `lib/api-admin.ts` — no duplicate fetch plumbing.
 */

import { adminFetch } from "@/lib/api-admin";
import type { AdminFetchOptions } from "@/lib/api-admin";

/** Options the auth wrappers accept — narrowed from the full admin
 *  fetch options (no CSRF — these endpoints are exempt, no body,
 *  no formData — auth POSTs always carry JSON). */
export type AuthFetchOptions = Pick<
  AdminFetchOptions,
  "baseUrl" | "internal" | "cookieHeader"
>;

// ---------------------------------------------------------------------------
// Types — match Sprint C1 backend serializers (accounts/serializers.py).
// ---------------------------------------------------------------------------

/** Locales the backend accepts in `default_locale` / `supported_locales`. */
export type AuthLocaleCode = "tr" | "en" | "de" | "fr" | "it" | "es" | "ar" | "ru";

/** Currency codes the backend accepts in `currency`. */
export type AuthCurrency = "TRY" | "EUR" | "USD" | "GBP";

/** Membership role returned by signup (always `owner` for the wizard). */
export type AuthMembershipRole = "owner" | "manager" | "staff" | "viewer";

/** User representation returned inside SignupResponse.user. */
export interface AuthSignupUser {
  id: number;
  email: string;
  full_name: string;
  role: "owner" | "manager" | "staff" | "viewer" | string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string;
  created_at: string;
}

/** Payload accepted by POST /api/v1/auth/signup/. */
export interface SignupPayload {
  email: string;
  password: string;
  full_name?: string;
  business_name: string;
  slug: string;
  default_locale: AuthLocaleCode;
  supported_locales: AuthLocaleCode[];
  currency: AuthCurrency;
}

/** Response shape returned by POST /api/v1/auth/signup/. */
export interface SignupResponse {
  user: AuthSignupUser;
  organization_id: number;
  organization_slug: string;
  organization_name: string;
  plan: string;
  membership_role: AuthMembershipRole;
}

/** Response shape returned by GET /api/v1/auth/check-slug/?slug=. */
export interface SlugAvailability {
  slug: string;
  available: boolean;
  /** `empty` | `reserved` | `invalid` | `taken` | `` (available). */
  reason: "empty" | "reserved" | "invalid" | "taken" | "" | string;
}

// ---------------------------------------------------------------------------
// Helpers — these are the two functions the wizard UI calls.
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/auth/signup/ — creates the tenant + auto-login.
 *
 * The backend runs a single `@transaction.atomic` block, so a 201
 * guarantees the user, organization, and PlanSettings(BASIC) all
 * exist. The session cookie (`qr_sessionid`) is set on the response
 * — the wizard's `setStep(2)` call only happens after a successful
 * 201 so we don't leak half-created state into later steps.
 */
export async function signup(
  payload: SignupPayload,
  options: AuthFetchOptions = {},
): Promise<SignupResponse> {
  return adminFetch<SignupResponse>("/api/v1/auth/signup", {
    method: "POST",
    body: payload,
    ...options,
  });
}

/**
 * GET /api/v1/auth/check-slug/?slug=<value> — real-time availability.
 *
 * `AllowAny` endpoint (enumeration is safe — we never reveal whether
 * an email is taken, just whether a slug string is free). The wizard
 * debounces 300ms before calling this so a fast typist doesn't fire
 * one request per keystroke.
 */
export async function checkSlugAvailability(
  slug: string,
  options: AuthFetchOptions = {},
): Promise<SlugAvailability> {
  const trimmed = slug.trim();
  const params = new URLSearchParams({ slug: trimmed });
  return adminFetch<SlugAvailability>(
    `/api/v1/auth/check-slug?${params.toString()}`,
    { ...options },
  );
}