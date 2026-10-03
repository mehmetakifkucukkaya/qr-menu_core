import Link from "next/link";
import { cookies } from "next/headers";
import { Receipt, Filter, X } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import {
  fetchOrders,
  AdminApiError,
  type AdminOrder,
  type AdminOrderStatus,
} from "@/lib/api-admin";
import { formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "./OrderStatusBadge";

// Admin list pages depend on cookies + the request user; opt out of static
// prerender so Next.js doesn't try to bake them at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

const STATUS_OPTIONS: Array<{ value: "" | AdminOrderStatus; label: string }> =
  [
    { value: "", label: "Tümü" },
    { value: "pending", label: "Beklemede" },
    { value: "confirmed", label: "Onaylandı" },
    { value: "preparing", label: "Hazırlanıyor" },
    { value: "ready", label: "Hazır" },
    { value: "delivered", label: "Teslim Edildi" },
    { value: "cancelled", label: "İptal Edildi" },
  ];

interface PageProps {
  searchParams: { status?: string; date?: string };
}

function resolveStatus(raw?: string): AdminOrderStatus | undefined {
  if (!raw) return undefined;
  const allowed: AdminOrderStatus[] = [
    "pending",
    "confirmed",
    "preparing",
    "ready",
    "delivered",
    "cancelled",
  ];
  return allowed.includes(raw as AdminOrderStatus)
    ? (raw as AdminOrderStatus)
    : undefined;
}

function resolveDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  // YYYY-MM-DD guard — backend's date filter expects this exact shape.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw;
}

/**
 * /admin/orders — tenant-scoped list of customer orders.
 *
 * Filters (query string):
 *   - `status=pending|confirmed|...` — single status filter
 *   - `date=YYYY-MM-DD` — placed_at date (matches the backend's
 *     `placed_at__date=…` filter)
 *
 * Each row links into the detail page (`/admin/orders/{id}`) which owns
 * the status-update buttons. The list itself is read-only so it can
 * stay a server component.
 */
export default async function OrdersListPage({ searchParams }: PageProps) {
  const cookieHeader = readCookieHeader();
  const status = resolveStatus(searchParams.status);
  const date = resolveDate(searchParams.date);

  let orders: AdminOrder[] = [];
  let loadError: string | null = null;

  try {
    orders = await fetchOrders(
      { ...(status ? { status } : {}), ...(date ? { date } : {}) },
      { internal: true, cookieHeader },
    );
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
      orders = [];
    } else {
      throw err;
    }
  }

  const hasFilters = Boolean(status) || Boolean(date);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Operasyon
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            Siparişler
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Müşterilerden gelen canlı siparişler. Bir satıra tıklayıp detay
            sayfasından onaylayabilir, hazırlık ve teslim durumlarını
            güncelleyebilirsiniz.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          <Receipt className="h-3.5 w-3.5" aria-hidden />
          {orders.length} kayıt
        </span>
      </header>

      {/* Filters */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3 shadow-sm"
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          Filtre
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Durum
          <select
            name="status"
            defaultValue={status ?? ""}
            className="min-w-[10rem] rounded-xl border border-input bg-surface px-2 py-1.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Tarih
          <input
            type="date"
            name="date"
            defaultValue={date ?? ""}
            className="rounded-xl border border-input bg-surface px-2 py-1.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          />
        </label>
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          Uygula
        </button>
        {hasFilters ? (
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <X className="h-3 w-3" aria-hidden />
            Temizle
          </Link>
        ) : null}
      </form>

      {loadError ? (
        <AdminErrorState
          title="Siparişler yüklenemedi"
          message={loadError}
          code="admin.orders.list_failed"
        />
      ) : orders.length === 0 ? (
        <AdminEmptyState
          icon={<Receipt className="h-8 w-8" aria-hidden />}
          title={
            hasFilters
              ? "Bu filtreyle eşleşen sipariş yok"
              : "Henüz sipariş yok"
          }
          message={
            hasFilters
              ? "Farklı bir tarih veya durum deneyin."
              : "Müşteriler QR menüden sipariş verdiğinde burada görünecek."
          }
        />
      ) : (
        <section
          aria-label="Sipariş listesi"
          className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
        >
          <table className="table-stack w-full table-auto border-collapse text-left">
            <thead className="bg-background">
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2 font-medium">Sipariş No</th>
                <th className="px-4 py-2 font-medium">Müşteri</th>
                <th className="px-4 py-2 font-medium">Masa</th>
                <th className="px-4 py-2 text-center font-medium">Ürün</th>
                <th className="px-4 py-2 text-right font-medium">Tutar</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 font-medium">Tarih</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-t border-border text-sm text-text transition hover:bg-primary/5"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-mono text-xs font-semibold text-primary hover:underline"
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td data-label="Müşteri" data-span="full" className="px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="font-medium">{o.customer_name}</span>
                      <span className="text-xs text-muted">
                        {o.customer_phone}
                      </span>
                    </div>
                  </td>
                  <td data-label="Masa" className="px-4 py-2.5">
                    {o.table_number ? (
                      <span className="rounded-md bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {o.table_number}
                      </span>
                    ) : (
                      <span className="text-xs italic text-muted">—</span>
                    )}
                  </td>
                  <td data-label="Ürün" className="px-4 py-2.5 text-center tabular-nums">
                    {o.item_count}
                  </td>
                  <td data-label="Tutar" className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {formatPrice(o.total_amount, o.currency)}
                  </td>
                  <td data-label="Durum" className="px-4 py-2.5">
                    <OrderStatusBadge status={o.status} />
                  </td>
                  <td data-label="Tarih" className="px-4 py-2.5 text-xs text-muted">
                    {new Date(o.placed_at).toLocaleString("tr-TR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        Liste en fazla 100 en son siparişi gösterir. Detay sayfasında
        sipariş durumunu güncelleyebilirsiniz.
      </p>
    </div>
  );
}