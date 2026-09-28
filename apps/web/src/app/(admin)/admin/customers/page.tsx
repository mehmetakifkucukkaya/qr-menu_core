import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import {
  fetchCurrentUser,
  fetchCustomers,
  AdminApiError,
} from "@/lib/api-admin";
import { CustomerAdminList } from "./CustomerAdminList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_NEXT = "/admin/customers";

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

interface PageProps {
  searchParams: { search?: string; page?: string };
}

/**
 * /admin/customers — tenant-scoped customer list (Sprint 10C).
 *
 * Filters (query string):
 *   - `search=` — substring across email/full_name/phone
 *   - `page=` — 1-indexed; V1 backend caps the page size at 200 so this
 *     only matters once the tenant grows past that threshold.
 *
 * The backend already returns `next` / `previous` cursors but it caps
 * at 200 rows total (no real pagination) — we render the count and let
 * the operator clear filters to widen the set.
 */
export default async function CustomersListPage({ searchParams }: PageProps) {
  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=" + DEFAULT_NEXT);
    }
    throw err;
  }

  const search = (searchParams.search ?? "").trim();
  const page = (() => {
    const n = Number.parseInt(searchParams.page ?? "1", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  })();

  let customers: Awaited<ReturnType<typeof fetchCustomers>>["results"] = [];
  let count = 0;
  let loadError: string | null = null;

  try {
    const result = await fetchCustomers(
      { ...(search ? { search } : {}), page },
      { internal: true, cookieHeader },
    );
    customers = result.results ?? [];
    count = result.count ?? customers.length;
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
    } else {
      throw err;
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Müşteriler
            </p>
            <h1 className="font-heading text-2xl font-bold text-text">
              Müşteri Yönetimi
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              İşletmenizden sipariş veren veya sadakat puanı kazanan
              müşteriler. Bir satıra tıklayarak detay sayfasından puan
              ayarlaması yapabilirsiniz.
            </p>
          </div>
        </div>
      </header>

      {loadError ? (
        <AdminErrorState
          title="Müşteriler yüklenemedi"
          message={loadError}
          code="admin.customers.list_failed"
        />
      ) : customers.length === 0 ? (
        <AdminEmptyState
          icon={<Users className="h-8 w-8" aria-hidden />}
          title={
            search
              ? "Aramayla eşleşen müşteri yok"
              : "Henüz kayıtlı müşteri yok"
          }
          message={
            search
              ? "Farklı bir e-posta, ad veya telefon deneyin."
              : "Müşteriler QR menüden sipariş verip hesap açtığında burada görünecek."
          }
          action={
            search ? (
              <Link
                href="/admin/customers"
                className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                Aramayı temizle
              </Link>
            ) : null
          }
        />
      ) : (
        <CustomerAdminList
          customers={customers}
          count={count}
          searchQuery={search}
        />
      )}
    </div>
  );
}
