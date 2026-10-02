/**
 * Public billing/feature-flag API client — Sprint B3a.
 *
 * Mirrors the pattern established by `lib/api.ts` (public menu,
 * Sprint 3) and `lib/api-account.ts` (public loyalty settings,
 * Sprint 10B):
 *
 *   - Server components pass `{ internal: true }` so the request hops
 *     straight to the `backend` service over the Docker network.
 *     The browser never calls these directly — the menu page renders
 *     settings into HTML during the server pass.
 *   - `credentials: "include"` is harmless here (the endpoint is
 *     AllowAny) and keeps the same surface as the other public
 *     clients in case the browser-side helper is ever needed.
 *   - `resolveBaseUrl` precedence matches `lib/api.ts` exactly.
 *
 * The endpoint is throttled at 60/min/IP (backend
 * `PublicSettingsThrottle`, scope `public_settings`). 429 responses are
 * surfaced verbatim — callers can decide whether to retry with
 * backoff, fall back to a safe-default `null`, or render a banner.
 */

import { internalApiHeaders } from "@/lib/internal-api";
import type {
  PublicEnvelope,
  PublicSettings,
} from "@/types/public";

// ---------------------------------------------------------------------------
// Options + error
// ---------------------------------------------------------------------------

/** Mirror of `PublicMenuError` for the feature-flag endpoint. Thrown so
 *  route segments can branch on `status` (e.g. 404 → notFound()). */
export class PublicSettingsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PublicSettingsError";
    this.status = status;
    this.code = code;
  }
}

export interface FetchPublicSettingsOptions {
  /** Override the base URL (tests / Storybook). */
  baseUrl?: string;
  /** Server-side: hit the backend container directly via Docker network. */
  internal?: boolean;
  /** Optional cookies to forward when calling from a server component.
   *  Public endpoint is AllowAny, but cookie forwarding keeps the helper
   *  composable with the other public clients. */
  cookieHeader?: string;
  /** Next.js Data Cache hint. Defaults to `no-store` because plan /
   *  feature flag changes should propagate within a request lifetime
   *  (V1 demo). Sprint 4+ may switch to `revalidate: 60` once we
   *  instrument the cache layer. */
  cache?: RequestCache;
  /** Explicit revalidate hint for Next 14 `fetch`. Unused when `cache`
   *  is `no-store`. */
  next?: { revalidate?: number; tags?: string[] };
  /** Extra headers (rarely needed). */
  headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Base URL resolution (parity with lib/api.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public settings fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the tenant-safe feature-flag payload for a business slug.
 *
 * `GET /api/v1/public/settings/<slug>/` →
 *   `{ data: PublicSettings, meta: { version: "v1" } }`
 *
 * Throws `PublicSettingsError` on:
 *   - network failure (status 0, code `network.error`)
 *   - 404 (tenant not found / inactive) — caller should bubble up to a
 *     not-found page via `notFound()` from `next/navigation`
 *   - 429 (rate limited) — caller can retry with exponential backoff or
 *     fall back to safe defaults
 *   - any other non-2xx status
 */
export async function fetchPublicSettings(
  organizationSlug: string,
  options: FetchPublicSettingsOptions = {},
): Promise<PublicSettings> {
  const {
    baseUrl,
    internal,
    cookieHeader,
    cache = "no-store",
    next,
    headers: extraHeaders,
  } = options;

  const base = resolveBaseUrl({ baseUrl, internal });
  const url = `${base.replace(/\/$/, "")}/api/v1/public/settings/${encodeURIComponent(
    organizationSlug,
  )}/`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(internal ? internalApiHeaders() : {}),
    ...extraHeaders,
  };
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "include",
      headers,
      cache,
      // `next` is only meaningful when `cache` allows the data cache;
      // Next 14 ignores it on `no-store`. We pass through verbatim so
      // future call sites can opt into caching with one option flag.
      // Cast via `unknown` to satisfy strict mode — Next 14's
      // `RequestInit` overload doesn't list `next`, but it accepts it
      // at runtime when `cache !== 'no-store'`.
      ...(next ? { next } : {}),
    } as RequestInit & { next?: { revalidate?: number; tags?: string[] } });
  } catch (err) {
    throw new PublicSettingsError(
      0,
      "network.error",
      err instanceof Error ? err.message : "Ağ hatası",
    );
  }

  if (!res.ok) {
    let code = "unknown";
    let message = `Beklenmeyen hata (HTTP ${res.status})`;
    try {
      // Endpoint mirrors the standard `{error:{code,message}}` shape used
      // by every other public surface, but the test suite asserts on
      // Django REST's `{detail: "..."}` form for 404s — accept both.
      const body = (await res.json()) as
        | { error?: { code: string; message: string } }
        | { detail?: string };
      if ("error" in body && body.error) {
        code = body.error.code;
        message = body.error.message;
      } else if ("detail" in body && typeof body.detail === "string") {
        code = res.status === 404 ? "public.tenant_not_found" : "api.error";
        message = body.detail;
      }
    } catch {
      /* body wasn't JSON — keep generic message */
    }
    throw new PublicSettingsError(res.status, code, message);
  }

  const envelope = (await res.json()) as PublicEnvelope<PublicSettings>;
  return envelope.data;
}

// ---------------------------------------------------------------------------
// Retry helper (429 backoff)
// ---------------------------------------------------------------------------

/**
 * Lightweight exponential-backoff retry for `fetchPublicSettings`. Only
 * retries on `PublicSettingsError` with status 429 — 4xx (other than
 * 429) and 5xx surface verbatim because they almost always indicate a
 * caller bug or a real backend outage worth surfacing, not a transient
 * throttle.
 *
 * Caller-facing defaults: 3 attempts, 250ms initial delay, 2x backoff
 * (250 → 500 → 1000). Overridable for tests / Storybook.
 */
export async function fetchPublicSettingsWithRetry(
  organizationSlug: string,
  options: FetchPublicSettingsOptions & {
    maxAttempts?: number;
    initialDelayMs?: number;
  } = {},
): Promise<PublicSettings> {
  const { maxAttempts = 3, initialDelayMs = 250, ...fetchOpts } = options;

  let lastError: PublicSettingsError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fetchPublicSettings(organizationSlug, fetchOpts);
    } catch (err) {
      if (
        !(err instanceof PublicSettingsError) ||
        err.status !== 429 ||
        attempt === maxAttempts
      ) {
        throw err;
      }
      lastError = err;
      const delay = initialDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  // Unreachable — the loop either returns or throws on the final attempt.
  throw lastError ?? new Error("retry helper exited unexpectedly");
}