import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { LoginForm } from "./LoginForm";
import { fetchCurrentUser, AdminApiError } from "@/lib/api-admin";

interface PageProps {
  searchParams: { next?: string };
}

const SESSION_COOKIE = "qr_sessionid";
// "/admin" is the role-aware front door (admin/page.tsx redirects per role).
const DEFAULT_NEXT = "/admin";

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
 * Whether the browser holds a session the server still accepts.
 *
 * Only the answer of `/api/v1/me` counts: the cookie alone proves nothing (the
 * server drops a session when its password changes, when it expires or after a
 * clean-up), and a stale cookie that sent the visitor on to `/admin` made the
 * layout bounce them straight back here - an endless redirect.
 *
 * NOTE: this must NOT call `redirect()` itself - the caller does that outside
 * any try/catch. `redirect()` throws a NEXT_REDIRECT error that looks like a
 * normal exception to `catch {}` and gets swallowed.
 */
async function hasValidSession(cookieHeader: string): Promise<boolean> {
  if (!cookies().get(SESSION_COOKIE)?.value) return false;

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
    return true;
  } catch (err) {
    // Only swallow auth failures (stale cookie). Re-throw network/5xx.
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      return false; // session was stale - render the form
    }
    throw err;
  }
}

/**
 * /login - admin sign-in page.
 *
 * Server-side: if the user already has a valid session, redirect to the
 * intended page (avoids an extra round-trip). Otherwise render the client
 * form; signing in replaces a stale cookie.
 *
 * The middleware allows `/login` unconditionally, so there is no redirect loop
 * as long as the check above is the real one.
 */
export default async function LoginPage({ searchParams }: PageProps) {
  const nextPath = safeNextPath(searchParams.next);

  // After the check (which throws on network errors) so its try/catch cannot
  // swallow the redirect exception below.
  if (await hasValidSession(readCookieHeader())) {
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
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      {/* Brand panel — desktop only. Pure CSS artwork, no image request. */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div aria-hidden className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
          <div className="absolute -right-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-secondary/50 mix-blend-screen blur-3xl" />
          <div className="absolute -bottom-40 -left-16 h-[30rem] w-[34rem] rounded-full bg-accent blur-3xl" />
          <div
            className="absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
            style={{
              backgroundImage:
                "radial-gradient(rgb(255 255 255 / 0.2) 1px, transparent 1.5px)",
              backgroundSize: "22px 22px",
            }}
          />
        </div>

        <div className="relative flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-base font-bold ring-1 ring-white/25"
          >
            QR
          </span>
          <span className="font-heading text-xl font-semibold">QR Menü</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-heading text-4xl font-semibold leading-tight tracking-tight">
            Menünüzü, fiyatlarınızı ve QR kodlarınızı tek yerden yönetin.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-primary-foreground/80">
            Yaptığınız değişiklikler müşterilerinizin gördüğü menüye anında
            yansır.
          </p>
        </div>

        <p className="relative text-sm text-primary-foreground/70">
          © {new Date().getFullYear()} QR Menü
        </p>
      </aside>

      {/* Form */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div
            aria-hidden
            className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-md lg:hidden"
          >
            QR
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-text">
            Hoş geldiniz
          </h1>
          <p className="mt-2 text-[0.9375rem] text-muted">
            İşletme hesabınızla giriş yapın.
          </p>

          <div className="mt-8">
            <LoginForm nextPath={nextPath} demoHint={demoHint} />
          </div>

          <p className="mt-8 text-center text-sm text-muted">
            Sorun mu yaşıyorsunuz?{" "}
            <a
              href="mailto:support@qr-menu.local"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Destek
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}
