"use server";

/**
 * Server actions for customer (magic-link) auth — Sprint 10B (D-025).
 *
 * Wraps the call-and-Set-Cookie dance so client components can submit
 * the login form and the dashboard can sign the user out without
 * juggling fetch + headers + cookies by hand.
 *
 * Both actions set / clear the `_auth_customer_id` cookie via
 * `next/headers#cookies()` which is the documented Next 14 way to write
 * cookies from a server action (the cookie travels on the response
 * back to the browser).
 *
 * Why a server action instead of a client fetch for `verifyMagicLink`?
 *  - The backend sets the session cookie on the response. A client
 *    fetch would receive that Set-Cookie but would NOT propagate it
 *    back to the document (browsers block Set-Cookie from cross-site
 *    fetches, and `credentials: "include"` only sends existing cookies
 *    — it doesn't store the response Set-Cookie). The server action
 *    path lets Next write the cookie on the document response.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AccountApiError,
  fetchCustomerLoyalty,
  fetchCustomerProfile,
  logoutCustomer as apiLogout,
  verifyMagicLink as apiVerify,
} from "@/lib/api-account";

/** Cookie name matches Django settings.AUTH_COOKIE_NAME default. */
const CUSTOMER_COOKIE = "_auth_customer_id";

/** Default max-age we mirror on the document. Matches backend 30-day TTL. */
const CUSTOMER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function resolveBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://backend:8000"
  );
}

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export interface VerifyMagicLinkResult {
  ok: boolean;
  error?: string;
}

/**
 * Server action: consume a magic-link token.
 *
 * Called by the `/account/verify` page on first render (the token
 * comes from the URL query string). On success:
 *   - Sets the customer cookie on the document via `cookies().set`.
 *   - Updates `last_login_at` via a follow-up GET (no-op; backend
 *     already updated it inside the verify transaction).
 *   - Redirects to `/account`.
 *
 * On failure returns an error message — the verify page renders it
 * inline and offers a "send another link" CTA.
 */
export async function verifyMagicLinkAction(
  token: string,
): Promise<VerifyMagicLinkResult> {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Token eksik veya hatalı." };
  }

  try {
    const result = await apiVerify(token, {
      internal: true,
      cookieHeader: readCookieHeader(),
    });
    const jar = cookies();
    jar.set(CUSTOMER_COOKIE, String(result.customer_id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: CUSTOMER_COOKIE_MAX_AGE_SECONDS,
      path: "/",
    });
  } catch (err) {
    if (err instanceof AccountApiError) {
      // Map backend stable codes to user-friendly messages.
      let msg = err.message;
      if (err.code === "token_invalid" || err.code === "invalid_token") {
        msg = "Bu bağlantı geçersiz. Yeni bir tane isteyin.";
      } else if (err.code === "token_expired" || err.code === "expired") {
        msg = "Bu bağlantının süresi dolmuş. Yeni bir tane isteyin.";
      } else if (err.code === "token_used") {
        msg = "Bu bağlantı zaten kullanılmış. Yeni bir tane isteyin.";
      }
      return { ok: false, error: msg };
    }
    return {
      ok: false,
      error: "Bağlantı doğrulanamadı. Lütfen tekrar deneyin.",
    };
  }

  // Redirect on success — the caller pattern is to call this server
  // action from a redirect-or-error page that prefers a server-side
  // navigation. Use `redirect` here so the browser URL updates.
  redirect("/account");
}

export interface LogoutResult {
  ok: boolean;
}

/**
 * Server action: log the current customer out.
 *
 * Best-effort: we forward the existing customer cookie to the backend's
 * `/auth/logout` endpoint, then clear the local cookie regardless of
 * the backend response (a stale session is never a good outcome).
 */
export async function logoutCustomerAction(): Promise<LogoutResult> {
  try {
    // The customer logout endpoint doesn't strictly need a CSRF token
    // (the session cookie is the auth proof), but we still let the
    // backend clear its bookkeeping if a CSRF token is present.
    await apiLogout("", {
      internal: true,
      cookieHeader: readCookieHeader(),
    });
  } catch {
    // Network or 5xx — still proceed to clear local cookie.
  }

  const jar = cookies();
  if (jar.get(CUSTOMER_COOKIE)) {
    jar.delete(CUSTOMER_COOKIE);
  }

  redirect("/account/login");
}

/**
 * Server-side helper used by the (public)/account/layout to gate
 * auth-required pages. Returns the live profile if the cookie session
 * is valid; returns `null` otherwise.
 */
export async function getServerCustomerProfile() {
  const cookieHeader = readCookieHeader();
  return await fetchCustomerProfileOrNull({
    internal: true,
    cookieHeader,
  });
}

/**
 * Internal — wraps `fetchCustomerProfile` with the same null-on-401
 * semantics as the API client helper. (Duplicate logic so the actions
 * module doesn't import a separate null-returning variant.)
 */
async function fetchCustomerProfileOrNull(opts: {
  internal?: boolean;
  cookieHeader?: string;
}) {
  try {
    return await fetchCustomerProfile(opts);
  } catch (err) {
    if (
      err instanceof AccountApiError &&
      (err.status === 401 || err.status === 403)
    ) {
      return null;
    }
    throw err;
  }
}

/** Server-side helper for the layout — pulls loyalty data if available. */
export async function getServerCustomerLoyalty(organizationSlug: string) {
  const cookieHeader = readCookieHeader();
  return await fetchCustomerLoyalty(organizationSlug, {
    internal: true,
    cookieHeader,
  });
}
