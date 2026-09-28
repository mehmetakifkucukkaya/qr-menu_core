"use client";

/**
 * AccountHeaderChip — Sprint 10B (D-025).
 *
 * Compact, header-friendly chip that adapts to the customer's login
 * state. Three variants:
 *
 *   - loggedOut  → "Giriş Yap" link → /account/login
 *   - loggedIn   → "Hesabım" link → /account (with email badge)
 *   - loggedIn + loyalty balance > 0 → adds LoyaltyBadge inline
 *
 * Reads from the zustand `useCustomerStore` cache (hydrated by
 * `<CustomerHydrator />` on /account). On the public menu page, the
 * parent server component reads the cookie + profile and renders the
 * chip with a fallback "not logged in" state when the fetch failed
 * (no cookie).
 */

import Link from "next/link";
import { User, LogIn } from "lucide-react";

import {
  useCustomerProfile,
  useCustomerStore,
} from "@/lib/customer-store";
import { LoyaltyBadge } from "@/app/(public)/account/_components/LoyaltyBadge";

interface AccountHeaderChipProps {
  /** Fallback when the store hasn't been hydrated yet (server-render
   *  branch — page passing initial server-fetched profile). */
  initialProfile?: {
    id: number;
    email: string;
    full_name: string;
  } | null;
  /** Fallback loyalty balance for the SSR / first-paint render. */
  initialLoyaltyBalance?: number;
}

export function AccountHeaderChip({
  initialProfile,
  initialLoyaltyBalance,
}: AccountHeaderChipProps) {
  const storeProfile = useCustomerProfile();
  const loyalty = useCustomerStore((s) => s.loyalty);
  const loaded = useCustomerStore((s) => s.loaded);

  // Prefer the live store; fall back to the server-passed initial value.
  const profile = storeProfile ?? initialProfile ?? null;
  const loyaltyBalance =
    typeof loyalty?.balance === "number"
      ? loyalty.balance
      : typeof initialLoyaltyBalance === "number"
        ? initialLoyaltyBalance
        : 0;

  if (!profile) {
    // Logged out (or still hydrating). Show a single "Giriş Yap" link.
    return (
      <Link
        href="/account/login"
        prefetch={false}
        aria-label="Hesabınıza giriş yapın"
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden />
        <span>Giriş Yap</span>
      </Link>
    );
  }

  // Logged in — show "Hesabım" + (optionally) loyalty badge.
  return (
    <div className="flex items-center gap-2">
      {loyaltyBalance > 0 ? (
        <Link
          href="/account/loyalty"
          prefetch={false}
          aria-label={`Sadakat puanım: ${loyaltyBalance}`}
          className="hidden sm:inline-flex"
        >
          <LoyaltyBadge points={loyaltyBalance} size="sm" />
        </Link>
      ) : null}
      <Link
        href="/account"
        prefetch={false}
        aria-label={`Hesabım — ${profile.email}`}
        className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <User className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Hesabım</span>
      </Link>
      {/* When the store is still cold we still render the chip from
          the server-passed prop — keeps the SSR vs CSR visual
          identical. */}
      {loaded ? null : null}
    </div>
  );
}
