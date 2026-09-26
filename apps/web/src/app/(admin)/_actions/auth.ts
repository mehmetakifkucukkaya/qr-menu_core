"use server";

/**
 * Server actions for admin auth (Sprint 4A).
 *
 * These wrap the CSRF + cookie dance so server components and forms
 * can call them without juggling fetch + headers + cookies by hand.
 *
 * Login flow:
 *   1. Get CSRF cookie + token via fetch (browser doesn't have the
 *      cookie yet, so the server-side fetch primes it and forwards it).
 *   2. POST /api/v1/auth/login with credentials + X-CSRFToken header.
 *   3. On success: redirect to ?next= (defaults to /admin/dashboard).
 *
 * Logout flow:
 *   1. Read CSRF token from the existing qr_csrftoken cookie.
 *   2. POST /api/v1/auth/logout.
 *   3. Always redirect to /login (even if the server says 401 — we're
 *      logging out either way).
 *
 * Why a server action instead of client-side fetch?
 *  - Avoids forwarding Set-Cookie headers from fetch to fetch (which
 *    isn't possible without next/cookies + Response clone).
 *  - Cookie writes via server actions land directly in the browser.
 *  - Centralises CSRF handling in one file.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  AdminApiError,
  fetchCsrfToken,
  login as apiLogin,
  logout as apiLogout,
} from "@/lib/api-admin";

const CSRF_COOKIE = "qr_csrftoken";
const SESSION_COOKIE = "qr_sessionid";
const LOGIN_PATH = "/login";
const DEFAULT_NEXT = "/admin/dashboard";

function resolveBaseUrl(): string {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://backend:8000"
  );
}

/** Read the CSRF token from the request cookies. Returns null if absent. */
function readCsrfCookie(): string | null {
  return cookies().get(CSRF_COOKIE)?.value ?? null;
}

/** Read the entire Cookie header so it can be replayed on outgoing fetches. */
function readCookieHeader(): string {
  const all = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return all;
}

/**
 * Sanitize the `next` param to prevent open-redirects — only allow
 * relative paths that start with `/admin`. Anything else falls back to
 * the dashboard.
 */
function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_NEXT;
  if (!raw.startsWith("/")) return DEFAULT_NEXT;
  if (!raw.startsWith("/admin")) return DEFAULT_NEXT;
  if (raw.startsWith("//")) return DEFAULT_NEXT; // protocol-relative trick
  return raw;
}

export interface LoginActionResult {
  ok: boolean;
  error?: string;
  /** Echoed back so the client can keep the email prefilled. */
  email?: string;
}

/**
 * Server action: handle the login form submission.
 * Returns a result object so the client form can render errors without
 * trapping a redirect (Next.js server actions can't both return data and
 * redirect on the same call).
 */
export async function loginAction(
  _prev: LoginActionResult | undefined,
  formData: FormData,
): Promise<LoginActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = formData.get("next");
  const nextPath = safeNextPath(nextRaw);

  if (!email || !password) {
    return {
      ok: false,
      error: "Email ve şifre zorunludur.",
      email,
    };
  }

  try {
    // Step 1: prime the CSRF cookie on the browser side. We use the
    // browser's existing cookies (which may already include the CSRF
    // cookie from a previous visit) as the Cookie header. The server
    // will refresh the cookie + return a token either way.
    const cookieHeader = readCookieHeader();
    const csrfToken = await fetchCsrfToken({
      internal: true,
      cookieHeader,
    });

    // Step 2: POST login with the fresh CSRF token. apiLogin will set
    // the session cookie via Set-Cookie in the response, but in a
    // server action we need to forward those cookies ourselves.
    const response = await fetch(
      `${resolveBaseUrl()}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRFToken": csrfToken,
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ email, password }),
        // Don't follow — we want to inspect Set-Cookie before the redirect.
        redirect: "manual",
      },
    );

    if (response.status === 502 || response.status === 503) {
      return {
        ok: false,
        error: "Sunucuya ulaşılamıyor. Lütfen tekrar deneyin.",
        email,
      };
    }

    // Forward Set-Cookie headers from the backend to the browser. DRF
    // sets both qr_sessionid and (optionally) a refreshed qr_csrftoken.
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      const jar = cookies();
      for (const raw of setCookies) {
        // crude Set-Cookie parser — we only need name + value for the
        // session and CSRF cookies. The other attributes are already
        // baked into the Django defaults (Path=/, SameSite=Lax, etc.).
        const [pair] = raw.split(";");
        const eq = pair.indexOf("=");
        if (eq === -1) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (name === SESSION_COOKIE || name === CSRF_COOKIE) {
          jar.set(name, value);
        }
      }
    }

    if (response.status === 200) {
      // Success — bounce to the protected route. The middleware will
      // see the session cookie and let us through.
      redirect(nextPath);
    }

    // Try to extract the error code/message so the form can show it.
    let errorMessage = "Email veya şifre hatalı.";
    try {
      const body = (await response.json()) as {
        error?: { code: string; message: string };
        detail?: string;
      };
      if (body.error?.message) errorMessage = body.error.message;
      else if (body.detail) errorMessage = body.detail;
    } catch {
      // body wasn't JSON; use the default.
    }

    return { ok: false, error: errorMessage, email };
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message, email };
    }
    return {
      ok: false,
      error: "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.",
      email,
    };
  }
}

/**
 * Server action: log the current user out. Safe to call when there's
 * no session — it just bounces to /login.
 */
export async function logoutAction(): Promise<void> {
  try {
    const csrfToken = readCsrfCookie();
    const cookieHeader = readCookieHeader();

    if (csrfToken) {
      const response = await fetch(`${resolveBaseUrl()}/api/v1/auth/logout`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-CSRFToken": csrfToken,
          Cookie: cookieHeader,
        },
        redirect: "manual",
      });

      // Clear both cookies on the browser side, regardless of backend
      // status (best-effort idempotent logout).
      if (response.status < 500) {
        const jar = cookies();
        for (const name of [SESSION_COOKIE, CSRF_COOKIE]) {
          if (jar.get(name)) {
            jar.delete(name);
          }
        }
      }
    }
  } catch {
    // Network error during logout — fall through to redirect. The user
    // is bounced to /login either way; their session may still be alive
    // on the backend but the cookie is gone on the browser side.
  }
  redirect(LOGIN_PATH);
}
