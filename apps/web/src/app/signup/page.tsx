import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { StepIndicator } from "@/components/signup/StepIndicator";
import { ProgressBar } from "@/components/signup/ProgressBar";
import { WizardHeader } from "./WizardHeader";
import { fetchCurrentUser, AdminApiError } from "@/lib/api-admin";
import { SignupWizardClient } from "./SignupWizardClient";

/**
 * /signup — Sprint C2 self-serve onboarding wizard.
 *
 * Server component responsibilities:
 *   1. Short-circuit already-signed-in users: a valid `qr_sessionid`
 *      cookie → `/admin/dashboard`. Otherwise render the wizard.
 *   2. Render the Container + Card shell with the step indicator +
 *      progress bar at the top.
 *   3. Hand off to `SignupWizardClient` (client component) for the
 *      active step body — the store + form state stay on the client.
 *
 * The `force-dynamic` export is required because we read cookies +
 * forward them to `/api/v1/me` on every render.
 */

const SESSION_COOKIE = "qr_sessionid";
const DEFAULT_NEXT = "/admin/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * Resolve whether to short-circuit. Returns the path to redirect to,
 * or `null` to render the wizard. Mirrors the (admin)/login pattern —
 * `redirect()` throws a NEXT_REDIRECT so we return the value and let
 * the caller decide.
 */
async function resolveAlreadySignedIn(
  cookieHeader: string,
): Promise<string | null> {
  const hasSession = Boolean(cookies().get(SESSION_COOKIE)?.value);
  if (!hasSession) return null;

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
    return DEFAULT_NEXT;
  } catch (err) {
    // Stale cookie → render the form (a fresh signup attempt will
    // overwrite the session via /auth/signup's auto-login).
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    // Network / 5xx: let the bubble surface — better to render the
    // wizard and let the user retry than to mask a real outage.
    throw err;
  }
}

export default async function SignupPage() {
  const cookieHeader = readCookieHeader();
  const alreadyIn = await resolveAlreadySignedIn(cookieHeader);
  if (alreadyIn) {
    redirect(alreadyIn);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Container size="sm" className="w-full">
        <div className="mb-6 text-center">
          <div
            aria-hidden
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground shadow-sm"
          >
            QR
          </div>
          <h1 className="font-heading text-2xl font-bold text-text">
            Yeni işletme kaydı
          </h1>
          <p className="mt-1 text-sm text-muted">
            5 adımda dijital menünüzü hazırlayın.
          </p>
        </div>

        <Card className="space-y-6">
          <WizardHeader />

          <SignupWizardClient />

          <div className="border-t border-border pt-4 text-center text-xs text-muted">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Giriş yapın
            </Link>
          </div>
        </Card>

        <p className="mt-4 text-center text-[11px] text-muted">
          Demo menüden başla →{" "}
          <span className="text-muted/70" title="Sprint C3&apos;te aktif olacak">
            (Sprint C3&apos;te aktif olacak)
          </span>
        </p>
      </Container>
    </main>
  );
}