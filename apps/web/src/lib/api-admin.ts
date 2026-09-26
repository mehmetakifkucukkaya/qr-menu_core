/**
 * Admin API client — Sprint 4A.
 *
 * Mirrors the patterns of `lib/api.ts` (public menu) but scoped to the
 * authenticated, cookie-based admin endpoints. Every request uses
 * `credentials: "include"` so the browser sends the `qr_sessionid` and
 * `qr_csrftoken` cookies automatically. CSRF is enforced by Django for
 * unsafe methods (POST/PATCH/DELETE) via `SessionAuthentication`, so the
 * client must first GET `/api/v1/auth/csrf` to seed the cookie, then
 * echo the token in the `X-CSRFToken` header on the next POST.
 *
 * Server components fetch with `internal: true` so the request hops
 * straight to the `backend` service in Docker and the cookies travel via
 * the Next.js `cookies()` store (set up in the (admin) layout).
 */

import type {
  ApiEnvelope,
  CsrfResponse,
  CurrentUser,
  Organization,
} from "@/types/admin";

/**
 * AdminApiError — mirrors PublicMenuError. Thrown so route segments /
 * server components can branch on status code.
 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

interface AdminFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** CSRF token to echo in the X-CSRFToken header (required for unsafe methods). */
  csrfToken?: string;
  body?: unknown;
  /** Override the base URL (tests / Storybook). */
  baseUrl?: string;
  /** Server-side: hit the backend container directly via Docker network. */
  internal?: boolean;
  /** Optional cookies to attach when calling from a server component
   *  (e.g. `cookies()` from `next/headers`). Browser requests don't need
   *  this — credentials: "include" handles it. */
  cookieHeader?: string;
  /** Optional extra headers. */
  headers?: Record<string, string>;
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
  );
}

/**
 * Low-level admin fetch — used by all the typed wrappers below. Handles:
 *  - base URL resolution (internal vs. browser)
 *  - credentials: include (browser) OR forwarded cookie header (server RSC)
 *  - X-CSRFToken header for unsafe methods
 *  - JSON envelope unwrapping (`{ data }`) and typed error throwing
 */
export async function adminFetch<T>(
  path: string,
  options: AdminFetchOptions = {},
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
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Admin payloads are dynamic — never cache.
      cache: "no-store",
    });
  } catch (err) {
    throw new AdminApiError(
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
        // DRF's default error shape (e.g. permission denied).
        errCode = res.status === 401 ? "auth.unauthenticated" : "api.error";
        errMessage = errBody.detail;
      }
    } catch {
      // body wasn't JSON — fall through with generic message.
    }
    throw new AdminApiError(res.status, errCode, errMessage);
  }

  const envelope = (await res.json()) as ApiEnvelope<T>;
  return envelope.data;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** GET /api/v1/auth/csrf — seeds the qr_csrftoken cookie and returns the token. */
export async function fetchCsrfToken(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<string> {
  const body = await adminFetch<CsrfResponse>("/api/v1/auth/csrf", {
    ...options,
  });
  return body.csrfToken;
}

/**
 * POST /api/v1/auth/login — establishes the session cookie.
 * Browser callers pass `csrfToken` from the preceding `fetchCsrfToken()` call.
 * Server components don't need it (Django sets the cookie via CSRF middleware
 * exemption on this view? — actually we DO need to send it).
 */
export async function login(
  email: string,
  password: string,
  csrfToken: string,
  options: Pick<AdminFetchOptions, "baseUrl"> = {},
): Promise<CurrentUser> {
  return adminFetch<CurrentUser>("/api/v1/auth/login", {
    method: "POST",
    csrfToken,
    body: { email, password },
    ...options,
  });
}

/** POST /api/v1/auth/logout — clears the session cookie. */
export async function logout(
  csrfToken: string,
  options: Pick<AdminFetchOptions, "baseUrl" | "cookieHeader"> = {},
): Promise<void> {
  await adminFetch<void>("/api/v1/auth/logout", {
    method: "POST",
    csrfToken,
    ...options,
  });
}

/** GET /api/v1/me — returns the current user JSON (or throws 401). */
export async function fetchCurrentUser(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CurrentUser> {
  return adminFetch<CurrentUser>("/api/v1/me", { ...options });
}

// ---------------------------------------------------------------------------
// Organization / Branch
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/organizations/ — list organizations the user is a
 * member of. V1 typically has exactly one organization per user.
 *
 * Server-side: pass `internal: true` so we hit `backend` over the Docker
 * network. The browser never calls this directly — it consumes RSC output.
 */
export async function fetchOrganizations(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Organization[]> {
  return adminFetch<Organization[]>("/api/v1/admin/organizations/", {
    ...options,
  });
}

/** Convenience — picks the user's first (and usually only) organization. */
export async function fetchCurrentOrganization(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Organization> {
  const orgs = await fetchOrganizations(options);
  const org = orgs[0];
  if (!org) {
    throw new AdminApiError(
      404,
      "organization.not_found",
      "Henüz bir işletme oluşturulmamış.",
    );
  }
  return org;
}
