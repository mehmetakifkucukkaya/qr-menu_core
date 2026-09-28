/**
 * /account/orders — full order history page (Sprint 10B / D-025).
 *
 * Server component, paginated. Mirrors the dashboard's recent-orders
 * contract but renders ALL pages plus Next / Prev pagination.
 * AccountShell enforces the auth gate.
 */

import { cookies } from "next/headers";

import { fetchCustomerOrders } from "@/lib/api-account";

import { AccountShell } from "../_components/AccountShell";
import { OrderHistoryList } from "../_components/OrderHistoryList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: {
    page?: string;
    status?: string;
  };
}

export default async function AccountOrdersPage({ searchParams }: PageProps) {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const rawPage = Number.parseInt(searchParams?.page ?? "1", 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const status =
    typeof searchParams?.status === "string" && searchParams.status
      ? searchParams.status
      : undefined;

  const result = await fetchCustomerOrders(
    { page, status },
    { internal: true, cookieHeader },
  ).catch(() => ({
    count: 0,
    next: null as string | null,
    previous: null as string | null,
    results: [],
  }));

  return (
    <AccountShell>
      <header className="mb-4">
        <h1 className="font-heading text-xl font-bold text-text">
          Sipariş Geçmişim
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tamamlanan ve devam eden tüm siparişleriniz.
        </p>
      </header>
      <OrderHistoryList
        result={result}
        page={page}
        pageSize={PAGE_SIZE}
        basePath="/account/orders"
      />
    </AccountShell>
  );
}
