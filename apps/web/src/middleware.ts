import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Admin auth guard — Sprint 4A.
 *
 * The full auth check (verifying the session is still valid via
 * `/api/v1/me`) lives in the (admin)/admin/layout.tsx server component,
 * which has access to fetch + cookies. Middleware only does a fast
 * cookie-presence check so unauthenticated users get bounced to /login
 * without rendering the layout.
 *
 * Path map (V1):
 *   /login                         → always allowed (form)
 *   /admin/**                      → requires `qr_sessionid` cookie
 *   /api/v1/auth/csrf              → allowed (CSRF bootstrap)
 *   /api/v1/auth/login             → allowed (auth bootstrap)
 *   /api/v1/auth/logout            → allowed (logout always succeeds)
 *   /api/v1/me                     → middleware doesn't intercept;
 *                                    server components decide
 *   /m/**, /, everything else      → allowed (public)
 *
 * Matcher excludes /api, /_next, /favicon.ico, and /m/* so this file
 * only runs for the handful of paths above.
 */

const SESSION_COOKIE = "qr_sessionid";
const ADMIN_PREFIX = "/admin";
const LOGIN_PATH = "/login";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  // Always allow the login page (incl. any ?next=... carry).
  if (pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  // Admin routes — require session cookie, otherwise redirect to login
  // with the original path so we can return the user after auth.
  if (pathname.startsWith(ADMIN_PREFIX)) {
    if (!hasSession) {
      const nextUrl = pathname + (search || "");
      const loginUrl = new URL(LOGIN_PATH, req.url);
      loginUrl.searchParams.set("next", nextUrl);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // Everything else: pass through (public routes, root, etc.).
  return NextResponse.next();
}

export const config = {
  // Match everything except /api/*, /_next/static, /_next/image,
  // /favicon.ico, the /m/* public menu path and the /media/* image proxy
  // (public pictures: no reason to run the admin session check on each one).
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|m/|media/).*)"],
};
