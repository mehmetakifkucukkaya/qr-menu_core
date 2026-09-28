/**
 * /account — customer dashboard (Sprint 10B / D-025).
 *
 * Server component: fetches the customer profile + loyalty + recent
 * orders directly from the backend (cookie-authenticated), then
 * hydrates the client island. AccountShell already bounces unauth'd
 * users to /account/login.
 */

import { cookies } from "next/headers";

import {
  fetchCustomerLoyalty,
  fetchCustomerOrders,
  fetchCustomerProfile,
} from "@/lib/api-account";

import { AccountShell } from "./_components/AccountShell";
import { CustomerDashboardClient } from "./_components/CustomerDashboardClient";
import { CustomerHydrator } from "./_components/CustomerHydrator";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_ORG_SLUG = "modern-cafe";

interface PageProps {
  searchParams: { org?: string };
}

export default async function AccountDashboardPage({
  searchParams,
}: PageProps) {
  const orgSlug =
    typeof searchParams?.org === "string" && searchParams.org
      ? searchParams.org
      : DEFAULT_ORG_SLUG;

  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const profile = await fetchCustomerProfile({
    internal: true,
    cookieHeader,
  });

  const [loyalty, orders] = await Promise.all([
    fetchCustomerLoyalty(orgSlug, { internal: true, cookieHeader }).catch(
      () => null,
    ),
    fetchCustomerOrders(
      { page: 1 },
      { internal: true, cookieHeader },
    ).catch(() => ({ count: 0, next: null, previous: null, results: [] })),
  ]);

  return (
    <AccountShell>
      <CustomerHydrator profile={profile} loyalty={loyalty} />
      <CustomerDashboardClient
        initialProfile={profile}
        orgSlug={orgSlug}
        recentOrders={orders.results.slice(0, 5).map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          total_amount: o.total_amount,
          currency: o.currency,
          placed_at: o.placed_at,
        }))}
      />
    </AccountShell>
  );
}
