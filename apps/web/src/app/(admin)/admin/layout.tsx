import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AdminHeader } from "../_components/AdminHeader";
import { AdminSidebar } from "../_components/AdminSidebar";
import { fetchCurrentOrganization, fetchCurrentUser, AdminApiError } from "@/lib/api-admin";
import { fetchTrialStatus } from "@/lib/api-onboarding";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { logoutAction } from "../_actions/auth";

const DEFAULT_NEXT = "/admin/dashboard";

// The layout reads cookies + calls fetch(`/api/v1/me`) on every render.
// Opt out of Next.js's static prerender to avoid "Dynamic server usage"
// errors at build time. Login pages are also dynamic by necessity.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read the entire Cookie header so it can be replayed on outgoing fetches. */
function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * (admin)/admin/layout.tsx — the admin shell that wraps every protected
 * page (dashboard, business, theme, menus in Sprint 4B).
 *
 * Server component responsibilities:
 *   1. Authoritative auth check via /api/v1/me. Middleware already
 *      redirected if there's no session cookie; here we verify the
 *      session is actually valid (cookie could be stale).
 *   2. Fetch the current organization for the sidebar brand area.
 *   3. Fetch the trial status for the sticky TrialBanner (Sprint C3b).
 *      Failure here is non-fatal — the banner just hides.
 *   4. Render sidebar + header + children.
 *
 * Login lives at `/(admin)/login` and intentionally sits outside this
 * layout so it doesn't render the sidebar/header.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieHeader = readCookieHeader();

  // ---- 1. Auth check -----------------------------------------------------
  let user;
  try {
    user = await fetchCurrentUser({
      internal: true,
      cookieHeader,
    });
  } catch (err) {
    // 401 / 403 (or any auth failure) → kick back to /login. Middleware
    // also does a cookie-presence check, but a stale cookie would slip
    // through it and land here.
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=" + DEFAULT_NEXT);
    }
    // Any other error (network, 5xx) is a server problem — re-throw so
    // Next.js renders the error boundary.
    throw err;
  }

  // ---- 2. Organization (for sidebar brand) ------------------------------
  // Failure here shouldn't block the page — fall back to "İşletmem".
  let businessName = "İşletmem";
  try {
    const org = await fetchCurrentOrganization({
      internal: true,
      cookieHeader,
    });
    businessName = org.name || businessName;
  } catch {
    // Best-effort; sidebar will show the default name.
  }

  // ---- 3. Trial status (for the TrialBanner) ----------------------------
  // Non-fatal: any failure (network, 403, etc.) → status stays null and
  // the banner hides itself. The TrialBanner receives the cookie header
  // we already read so the RSC fetch rides the same Django session.
  let trialStatus = null;
  try {
    trialStatus = await fetchTrialStatus({
      internal: true,
      cookieHeader,
    });
  } catch {
    // Banner hides; we keep the layout renderable.
  }

  // ---- 4. Shell ---------------------------------------------------------
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar businessName={businessName} logoutAction={logoutAction} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TrialBanner status={trialStatus} />
        <AdminHeader user={user} logoutAction={logoutAction} />

        <main
          id="main-content"
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
