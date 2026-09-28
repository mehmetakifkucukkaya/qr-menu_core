/**
 * OrderHistoryList — Sprint 10B (D-025).
 *
 * Server component that renders the customer's recent / paginated
 * order history. Reuses the same color tones as
 * `app/(admin)/admin/orders/OrderStatusBadge.tsx` so the lifecycle is
 * visually consistent across admin + customer views.
 */

import Link from "next/link";
import { Receipt } from "lucide-react";

import { formatPrice } from "@/lib/format";
import type {
  CustomerOrderHistoryItem,
  CustomerOrderHistoryResult,
  OrderStatus,
} from "@/types/account";

interface OrderHistoryListProps {
  result: CustomerOrderHistoryResult;
  /** Current page (1-indexed). Used to render Next / Prev links. */
  page?: number;
  pageSize?: number;
  /** Optional callback URL for links (e.g. "/account/orders?page=N"). */
  basePath?: string;
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-blue-100 text-blue-800 ring-blue-200",
  confirmed: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  preparing: "bg-amber-100 text-amber-800 ring-amber-200",
  ready: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  delivered: "bg-green-100 text-green-800 ring-green-200",
  cancelled: "bg-red-100 text-red-800 ring-red-200",
};

export function OrderHistoryList({
  result,
  page = 1,
  pageSize = 25,
  basePath = "/account/orders",
}: OrderHistoryListProps) {
  if (result.results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center">
        <Receipt className="h-8 w-8 text-muted" aria-hidden />
        <p className="font-heading text-base font-semibold text-text">
          Henüz siparişiniz yok
        </p>
        <p className="text-sm text-muted">
          Bir menüden sipariş verdiğinizde geçmişiniz burada görünecek.
        </p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Menüyü gör
        </Link>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.count / pageSize));

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {result.results.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </ol>
      {totalPages > 1 ? (
        <nav
          aria-label="Sipariş geçmişi sayfalama"
          className="flex items-center justify-between gap-2 pt-2"
        >
          {page > 1 ? (
            <Link
              href={`${basePath}?page=${page - 1}`}
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              ← Önceki
            </Link>
          ) : (
            <span aria-hidden />
          )}
          <span className="text-xs text-muted">
            Sayfa {page} / {totalPages} ({result.count} sipariş)
          </span>
          {page < totalPages ? (
            <Link
              href={`${basePath}?page=${page + 1}`}
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface px-4 py-2 text-xs font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Sonraki →
            </Link>
          ) : (
            <span aria-hidden />
          )}
        </nav>
      ) : null}
    </div>
  );
}

function OrderRow({ order }: { order: CustomerOrderHistoryItem }) {
  const placed = new Date(order.placed_at);
  const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text">
              #{order.order_number}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${STATUS_TONE[order.status]}`}
            >
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {order.organization_name}
            {order.branch_name ? ` · ${order.branch_name}` : ""}
            {order.table_number ? ` · Masa ${order.table_number}` : ""}
            {" · "}
            {placed.toLocaleDateString("tr-TR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-heading text-base font-bold tabular-nums text-primary">
            {formatPrice(order.total_amount, order.currency)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-muted">
            {itemCount} ürün
          </p>
        </div>
      </div>
      {order.items.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-muted">
          {order.items.slice(0, 3).map((it, idx) => (
            <li key={idx} className="truncate">
              {it.quantity} × {it.name}
            </li>
          ))}
          {order.items.length > 3 ? (
            <li className="italic">
              +{order.items.length - 3} ürün daha
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
