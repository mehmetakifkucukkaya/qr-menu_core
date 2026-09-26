import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { LoginForm } from "./LoginForm";
import { fetchCurrentUser, AdminApiError } from "@/lib/api-admin";

interface PageProps {
  searchParams: { next?: string };
}

const SESSION_COOKIE = "qr_sessionid";
const DEFAULT_NEXT = "/admin/dashboard";

// Login reads cookies + may call /api/v1/me to short-circuit already-signed-in users.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read the entire Cookie header so we can forward it to outgoing fetches. */
function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

function safeNextPath(raw: string | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith("/")) return DEFAULT_NEXT;
  if (!raw.startsWith("/admin")) return DEFAULT_NEXT;
  if (raw.startsWith("//")) return DEFAULT_NEXT;
  return raw;
}

/**
 * Decide whether to short-circuit the login page when a session cookie
 * is already present. Returns the safe next-path on success, or null if
 * we should render the login form.
 *
 * NOTE: this must NOT call `redirect()` itself — the caller does that
 * outside any try/catch. `redirect()` throws a NEXT_REDIRECT error that
 * looks like a normal exception to `catch {}` and gets swallowed.
 */
async function resolveAlreadySignedIn(
  cookieHeader: string,
): Promise<string | null> {
  const hasSession = Boolean(cookies().get(SESSION_COOKIE)?.value);
  if (!hasSession) return null;

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
    // Caller will redirect to this path on success.
    return null;
  } catch (err) {
    // Only swallow auth failures (stale cookie). Re-throw network/5xx.
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      return null; // session was stale — render the form
    }
    throw err;
  }
}

/**
 * /login — admin sign-in page.
 *
 * Server-side: if the user already has a valid session, redirect to the
 * intended page (avoids an extra round-trip). Otherwise render the
 * client form.
 *
 * The middleware allows `/login` unconditionally, so we don't need to
 * worry about redirect loops here.
 */
export default async function LoginPage({ searchParams }: PageProps) {
  const nextPath = safeNextPath(searchParams.next);
  const cookieHeader = readCookieHeader();
  await resolveAlreadySignedIn(cookieHeader);

  // If the user has a valid session, bounce to the intended page.
  // We do this AFTER `resolveAlreadySignedIn` (which throws on network
  // errors) so the try/catch above doesn't accidentally swallow the
  // redirect exception below.
  const hasSession = Boolean(cookies().get(SESSION_COOKIE)?.value);
  if (hasSession) {
    redirect(nextPath);
  }

  const demoHint = process.env.NEXT_PUBLIC_ADMIN_DEMO_HINT
    ? {
        email: process.env.NEXT_PUBLIC_ADMIN_DEMO_EMAIL ?? "admin@modern-cafe.local",
        password:
          process.env.NEXT_PUBLIC_ADMIN_DEMO_PASSWORD ?? "change-me-demo-only",
      }
    : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div
            aria-hidden
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground shadow-sm"
          >
            QR
          </div>
          <h1 className="font-heading text-2xl font-bold text-text">
            QR Menü · Admin
          </h1>
          <p className="mt-1 text-sm text-muted">
            İşletme hesabınızla giriş yapın.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-card">
          <LoginForm nextPath={nextPath} demoHint={demoHint} />
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Sorun mu yaşıyorsunuz?{" "}
          <a
            href="mailto:support@qr-menu.local"
            className="text-primary hover:underline"
          >
            Destek
          </a>
        </p>
      </div>
    </main>
  );
}
