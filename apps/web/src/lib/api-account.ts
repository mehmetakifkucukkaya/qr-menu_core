/**
 * Customer-account API client — Sprint 10B (D-025).
 *
 * Mirrors the convention used by `lib/api-admin.ts`:
 *  - base URL resolution via `INTERNAL_API_BASE_URL` (server) /
 *    `NEXT_PUBLIC_API_BASE_URL` (browser)
 *  - `internal:true` for server components so we hit the backend container
 *    directly via the Docker internal network
 *  - `cookieHeader` for server components to forward the inbound Cookie
 *    header onto outgoing fetches
 *  - `credentials:"include"` for browser-side fetches that DO need the
 *    cookie round-trip
 *  - `csrfToken` for unsafe methods
 *
 * The customer account session is a signed cookie
 * (`_auth_customer_id`, opaque to the frontend) — distinct from the admin `qr_sessionid` so the
 * two sessions can coexist on the same browser without invalidating
 * each other. CSRF is enforced only on `POST /auth/logout`; the magic
 * link endpoints are exempt (D-025).
 */

import { internalApiHeaders } from "@/lib/internal-api";
import type {
  CustomerLoyaltySummary,
  CustomerOrderHistoryResult,
  CustomerProfile,
  CustomerProfileUpdate,
  LogoutResponse,
  MagicLinkRequestResponse,
  MagicLinkVerifyResponse,
  PublicLoyaltySettings,
} from "@/types/account";

/**
 * AccountApiError — mirrors AdminApiError. Thrown so callers can branch
 * on `status` (e.g. 401 → redirect to login) / `code` (e.g.
 * `loyalty.disabled`).
 */
export class AccountApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AccountApiError";
    this.status = status;
    this.code = code;
  }
}

/** Options accepted by every account-API helper. */
export interface AccountFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** CSRF token — required for unsafe methods in browser context. */
  csrfToken?: string;
  body?: unknown;
  /** Override the base URL (tests / Storybook). */
  baseUrl?: string;
  /** Server-side: hit the backend container directly via Docker network. */
  internal?: boolean;
  /** Server-side cookies to forward onto the outgoing fetch. */
  cookieHeader?: string;
  /** Extra headers (rarely needed). */
  headers?: Record<string, string>;
}

export interface ServerOptions {
  internal?: boolean;
  cookieHeader?: string;
}

function resolveBaseUrl(opts: { baseUrl?: string; internal?: boolean }): string {
  if (opts.baseUrl) return opts.baseUrl;
  if (opts.internal) {
    return process.env.INTERNAL_API_BASE_URL || "http://backend:8000";
  }
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.INTERNAL_API_BASE_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

/**
 * Low-level account fetch. Same envelope unwrapping logic as
 * `adminFetch` — accept either `{data, meta}` or a raw payload.
 */
async function accountFetch<T>(
  path: string,
  options: AccountFetchOptions = {},
): Promise<T> {
  const {
    method = "GET",
    csrfToken,
    body,
    baseUrl,
    internal,
    cookieHeader,
    headers: extraHeaders,
  } = options;

  const base = resolveBaseUrl({ baseUrl, internal });
  const url = `${base.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(internal ? internalApiHeaders() : {}),
    ...extraHeaders,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    throw new AccountApiError(
      0,
      "network.error",
      err instanceof Error ? err.message : "Ağ hatası",
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let errCode = "unknown";
    let errMessage = `Beklenmeyen hata (HTTP ${res.status})`;
    try {
      const errBody = (await res.json()) as
        | { error?: { code: string; message: string } }
        | { detail?: string };
      if ("error" in errBody && errBody.error) {
        errCode = errBody.error.code;
        errMessage = errBody.error.message;
      } else if ("detail" in errBody && typeof errBody.detail === "string") {
        errCode = res.status === 401 ? "auth.unauthenticated" : "api.error";
        errMessage = errBody.detail;
      }
    } catch {
      /* body wasn't JSON — fall through with generic message */
    }
    throw new AccountApiError(res.status, errCode, errMessage);
  }

  const payload = (await res.json()) as unknown;
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    !("count" in (payload as Record<string, unknown>)) &&
    !("results" in (payload as Record<string, unknown>))
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------

/**
 * POST /api/v1/account/auth/request-link — request a magic link.
 *
 * Always returns `{ok:true}` even when the email is unknown
 * (enumeration-safe). The backend enforces a 5/hour IP throttle; on
 * 429 the server returns 429 with the standard `{error}` envelope.
 *
 * Browser-side: pass `csrfToken` from a prior `fetchCsrfToken()` call.
 * Server-side: leave `csrfToken` empty — the request exempts CSRF and
 * the backend will accept the call without a token.
 */
export async function requestMagicLink(
  email: string,
  csrfToken?: string,
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<MagicLinkRequestResponse> {
  return accountFetch<MagicLinkRequestResponse>(
    "/api/v1/account/auth/request-link",
    {
      method: "POST",
      body: { email },
      csrfToken,
      ...options,
    },
  );
}

/**
 * GET /api/v1/account/auth/verify?token=... — consumes a magic-link
 * token. On success the backend sets the `_auth_customer_id` cookie
 * via Set-Cookie and returns the customer id + TTL.
 *
 * The browser call's response includes the Set-Cookie header in the
 * fetch result; the caller usually can't propagate that back to the
 * document (you can't set a cookie from a non-server response). We
 * therefore recommend invoking this through the server action
 * `verifyMagicLinkAction` which uses Next's `cookies()` to write the
 * session into the response.
 */
export async function verifyMagicLink(
  token: string,
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<MagicLinkVerifyResponse> {
  return accountFetch<MagicLinkVerifyResponse>(
    `/api/v1/account/auth/verify?token=${encodeURIComponent(token)}`,
    { ...options },
  );
}

/**
 * POST /api/v1/account/auth/logout — clear the customer session cookie.
 *
 * Backend behaviour: always returns 200 + clears the cookie. CSRF is
 * enforced via Django's SessionAuthentication path. Server actions
 * should forward the cookie + a CSRF token; the browser client is
 * expected to have already fetched a `qr_csrftoken`.
 */
export async function logoutCustomer(
  csrfToken: string,
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<LogoutResponse> {
  return accountFetch<LogoutResponse>("/api/v1/account/auth/logout", {
    method: "POST",
    csrfToken,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/account/me — current customer profile (cookie session).
 *
 * Throws `AccountApiError(401)` when no cookie is present. Use
 * `fetchCustomerProfileOrNull` for "render nothing if not logged in"
 * flows.
 */
export async function fetchCustomerProfile(
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CustomerProfile> {
  return accountFetch<CustomerProfile>("/api/v1/account/me", { ...options });
}

/**
 * Convenience variant of `fetchCustomerProfile` — returns `null` on 401
 * instead of throwing. Used by server components that want to skip the
 * account UI when there is no session.
 */
export async function fetchCustomerProfileOrNull(
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CustomerProfile | null> {
  try {
    return await fetchCustomerProfile(options);
  } catch (err) {
    if (err instanceof AccountApiError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

/**
 * PATCH /api/v1/account/me — partial update (full_name, phone only).
 */
export async function updateCustomerProfile(
  payload: CustomerProfileUpdate,
  csrfToken: string,
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CustomerProfile> {
  return accountFetch<CustomerProfile>("/api/v1/account/me", {
    method: "PATCH",
    body: payload,
    csrfToken,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Orders + loyalty
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/account/me/orders — paginated customer order history.
 *
 * Filters:
 *  - `status` — one of OrderStatus. Optional.
 *  - `page` — 1-indexed. Optional.
 */
export async function fetchCustomerOrders(
  filters: { status?: string; page?: number } = {},
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CustomerOrderHistoryResult> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return accountFetch<CustomerOrderHistoryResult>(
    `/api/v1/account/me/orders${qs ? `?${qs}` : ""}`,
    { ...options },
  );
}

/**
 * GET /api/v1/account/me/loyalty?organization=<slug> — balance +
 * transactions for the requested org. 404 means the customer has no
 * history at that tenant (common — the loyalty banner is org-scoped).
 */
export async function fetchCustomerLoyalty(
  organizationSlug: string,
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CustomerLoyaltySummary | null> {
  try {
    return await accountFetch<CustomerLoyaltySummary>(
      `/api/v1/account/me/loyalty?organization=${encodeURIComponent(organizationSlug)}`,
      { ...options },
    );
  } catch (err) {
    if (err instanceof AccountApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * GET /api/v1/account/loyalty/settings?organization=<slug> — public read
 * (banner için). Returns null when the org has loyalty disabled or the
 * slug is unknown — the frontend uses this to decide whether to render
 * the loyalty section at all.
 */
export async function fetchPublicLoyaltySettings(
  organizationSlug: string,
  options: Pick<AccountFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<PublicLoyaltySettings | null> {
  try {
    return await accountFetch<PublicLoyaltySettings>(
      `/api/v1/account/loyalty/settings?organization=${encodeURIComponent(organizationSlug)}`,
      { ...options },
    );
  } catch (err) {
    if (err instanceof AccountApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}
