/**
 * AccountShell — Sprint 10B (D-025).
 *
 * Server-component wrapper that:
 *   1. Reads the customer cookie and fetches the live profile to
 *      confirm the session is still valid. A stale cookie bounces to
 *      /account/login just like a missing one.
 *   2. Renders a sticky top bar with the customer email + a logout
 *      button (server-action wired) + an optional CTA (e.g. "Sipariş ver").
 *   3. Renders the page contents (children).
 *
 * Used directly by each protected page (dashboard / orders / loyalty);
 * there is no (public)/account/layout.tsx so the login + verify pages
 * can opt out of the shell entirely.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { fetchCustomerProfileOrNull } from "@/lib/api-account";

import { LogoutButton } from "./LogoutButton";

interface AccountShellProps {
  children: React.ReactNode;
  /** Optional CTA shown next to the brand label (e.g. "Sipariş ver"). */
  brandExtra?: React.ReactNode;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export async function AccountShell({ children, brandExtra }: AccountShellProps) {
  const profile = await fetchCustomerProfileOrNull({
    internal: true,
    cookieHeader: readCookieHeader(),
  });
  if (!profile) {
    redirect("/account/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <Link
            href="/account"
            className="flex min-w-0 items-center gap-2"
            aria-label="Hesabım anasayfası"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >
              👤
            </span>
            <span className="truncate font-heading text-sm font-semibold text-text sm:text-base">
              Hesabım
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <span
              className="hidden truncate text-xs text-muted sm:inline"
              title={profile.email}
            >
              {profile.email}
            </span>
            {brandExtra}
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
