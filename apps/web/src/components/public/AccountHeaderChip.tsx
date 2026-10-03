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
import { useFeatureFlag } from "@/lib/feature-flags";
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

  // Sprint B3b — feature flag gating. Reads the FeatureFlagProvider
  // mounted by <MenuViewClient>. Both flags default to false when
  // settings haven't loaded (provider returns null → safe-default).
  const customerAccountsEnabled = useFeatureFlag("customer_accounts_enabled");
  const loyaltyEnabled = useFeatureFlag("loyalty_enabled");

  // Prefer the live store; fall back to the server-passed initial value.
  const profile = storeProfile ?? initialProfile ?? null;
  const loyaltyBalance =
    typeof loyalty?.balance === "number"
      ? loyalty.balance
      : typeof initialLoyaltyBalance === "number"
        ? initialLoyaltyBalance
        : 0;

  // When both account-system and loyalty features are off, the chip
  // adds zero value — render nothing rather than a confusing "Giriş
  // Yap" link to a feature the tenant doesn't sell.
  if (!customerAccountsEnabled && !loyaltyEnabled) {
    return null;
  }

  if (!profile) {
    // Logged out (or still hydrating). Show a single "Giriş Yap" link —
    // only when customer accounts are enabled on this tenant.
    if (!customerAccountsEnabled) return null;
    return (
      <Link
        href="/account/login"
        prefetch={false}
        aria-label="Hesabınıza giriş yapın"
        className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-surface/90 px-3.5 text-sm font-semibold text-text shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-200 hover:bg-surface"
      >
        <LogIn className="h-4 w-4" aria-hidden />
        <span>Giriş Yap</span>
      </Link>
    );
  }

  // Logged in — show "Hesabım" + (optionally) loyalty badge. Each piece
  // is independently gated by its feature so a tenant with only
  // `customer_accounts_enabled` still gets the chip, and one with only
  // `loyalty_enabled` gets the puan badge without the "Hesabım" link.
  const showLoyalty = loyaltyEnabled && loyaltyBalance > 0;
  const showAccount = customerAccountsEnabled;

  if (!showLoyalty && !showAccount) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {showLoyalty ? (
        <Link
          href="/account/loyalty"
          prefetch={false}
          aria-label={`Sadakat puanım: ${loyaltyBalance}`}
          className="hidden sm:inline-flex"
        >
          <LoyaltyBadge points={loyaltyBalance} size="sm" />
        </Link>
      ) : null}
      {showAccount ? (
        <Link
          href="/account"
          prefetch={false}
          aria-label={`Hesabım — ${profile.email}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-pill bg-surface/90 px-3.5 text-sm font-semibold text-text shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-200 hover:bg-surface"
        >
          <User className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Hesabım</span>
        </Link>
      ) : null}
      {/* When the store is still cold we still render the chip from
          the server-passed prop — keeps the SSR vs CSR visual
          identical. */}
      {loaded ? null : null}
    </div>
  );
}
