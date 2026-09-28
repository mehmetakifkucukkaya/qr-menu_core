/**
 * /account/loyalty — full loyalty ledger + balance card (Sprint 10B / D-025).
 *
 * Server component. Calls /me/loyalty with the org slug (defaults to
 * "modern-cafe" so the dev experience matches the demo data).
 * AccountShell enforces the auth gate.
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { Crown } from "lucide-react";

import { fetchCustomerLoyalty } from "@/lib/api-account";
import { fetchPublicLoyaltySettings } from "@/lib/api-account";

import { AccountShell } from "../_components/AccountShell";
import { LoyaltyLedgerTable } from "../_components/LoyaltyLedgerTable";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_ORG_SLUG = "modern-cafe";

interface PageProps {
  searchParams: { org?: string };
}

export default async function AccountLoyaltyPage({ searchParams }: PageProps) {
  const orgSlug =
    typeof searchParams?.org === "string" && searchParams.org
      ? searchParams.org
      : DEFAULT_ORG_SLUG;
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  // /me/loyalty returns 404 when the customer has no history at the
  // requested org, or when loyalty is disabled for that org. Treat
  // that as an empty state.
  const [loyalty, publicSettings] = await Promise.all([
    fetchCustomerLoyalty(orgSlug, { internal: true, cookieHeader }),
    fetchPublicLoyaltySettings(orgSlug, { internal: true }),
  ]);

  const transactions = loyalty?.transactions ?? [];
  const isEmpty = transactions.length === 0;
  const balance = loyalty?.balance ?? 0;
  const orgName = loyalty?.organization.name ?? orgSlug;

  // Effective settings for the heading (best-effort — backend exposes
  // these only if the org has loyalty enabled; we fall back to
  // loyalty-reporting-friendly defaults).
  const earnRate = publicSettings?.points_per_currency_unit ?? "1.00";
  const redeemRate = publicSettings?.redemption_rate ?? "0.10";
  const minPoints = publicSettings?.min_points_to_redeem ?? 100;

  return (
    <AccountShell>
      <header className="mb-4">
        <h1 className="font-heading text-xl font-bold text-text">
          Sadakat Puanlarım
        </h1>
        <p className="mt-1 text-sm text-muted">
          {orgName} için puan kazanın ve bir sonraki siparişinizde
          indirim olarak kullanın.
        </p>
      </header>

      <section
        aria-label="Puan özeti"
        className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-600" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Mevcut Bakiye
          </span>
        </div>
        <p className="mt-2 font-heading text-4xl font-bold tabular-nums text-amber-900">
          {balance.toLocaleString("tr-TR")}{" "}
          <span className="text-base font-semibold text-amber-700">puan</span>
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-xs text-amber-900 sm:grid-cols-3">
          <div>
            <dt className="font-semibold uppercase tracking-wider text-amber-700">
              Nasıl kazanılır
            </dt>
            <dd className="mt-1">
              Tamamlanan her sipariş için {earnRate}× tutar = puan.
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-amber-700">
              Harcama oranı
            </dt>
            <dd className="mt-1">
              1 puan = {redeemRate} ₺ indirim.
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wider text-amber-700">
              Minimum
            </dt>
            <dd className="mt-1">
              İndirim kullanmak için en az {minPoints.toLocaleString("tr-TR")}{" "}
              puan gerekir.
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-amber-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
          >
            Menüye dön
          </Link>
          <Link
            href="/account"
            className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-surface px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-300"
          >
            ← Hesabım
          </Link>
        </div>
      </section>

      <h2 className="mt-6 mb-2 font-heading text-base font-bold text-text">
        İşlem Geçmişi
      </h2>
      <LoyaltyLedgerTable
        transactions={transactions}
        settings={
          publicSettings ?? {
            is_enabled: true,
            points_per_currency_unit: earnRate,
            redemption_rate: redeemRate,
            min_points_to_redeem: minPoints,
          }
        }
        isEmpty={isEmpty}
      />
    </AccountShell>
  );
}
