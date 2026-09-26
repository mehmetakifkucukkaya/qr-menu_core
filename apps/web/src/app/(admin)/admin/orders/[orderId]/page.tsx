import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import {
  Receipt,
  Phone,
  MapPin,
  Calendar,
  Hash,
  StickyNote,
  ArrowLeft,
  User,
} from "lucide-react";

import {
  fetchOrderDetail,
  AdminApiError,
} from "@/lib/api-admin";
import { formatPrice } from "@/lib/format";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { OrderDetailControls } from "./OrderDetailControls";

// Detail page depends on cookies + the request user; opt out of static
// prerender so Next.js doesn't try to bake it at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

interface PageProps {
  params: { orderId: string };
}

function resolveId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const TIMELINE_FIELDS = [
  { key: "placed_at", label: "Sipariş Alındı" },
  { key: "confirmed_at", label: "Onaylandı" },
  { key: "preparing_at", label: "Hazırlanıyor" },
  { key: "ready_at", label: "Hazır" },
  { key: "delivered_at", label: "Teslim Edildi" },
  { key: "cancelled_at", label: "İptal Edildi" },
] as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * /admin/orders/{id} — full order detail + status-update controls.
 *
 * Layout:
 *   - Header card: order number + status badge + customer + total
 *   - Status update buttons (client island — needs CSRF)
 *   - Items table (snapshot — price + name preserved even if menu item deleted)
 *   - Customer notes (general + per-line)
 *   - Timeline (placed → confirmed → preparing → ready → delivered)
 */
export default async function OrderDetailPage({ params }: PageProps) {
  const cookieHeader = readCookieHeader();
  const id = resolveId(params.orderId);
  if (id === null) notFound();

  let order;
  try {
    order = await fetchOrderDetail(id, { internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link
        href="/admin/orders"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Sipariş listesine dön
      </Link>

      {/* Header card */}
      <header className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">
              Sipariş
            </p>
            <h1 className="mt-1 flex items-center gap-2 font-mono text-xl font-bold text-text">
              <Hash className="h-4 w-4 text-muted" aria-hidden />
              {order.order_number}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" aria-hidden />
                {order.customer_name}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" aria-hidden />
                {order.customer_phone}
              </span>
              {order.table_number ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  Masa {order.table_number}
                </span>
              ) : null}
              {order.branch_name ? (
                <span className="inline-flex items-center gap-1.5">
                  Şube: {order.branch_name}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <OrderStatusBadge status={order.status} />
            <p className="font-heading text-2xl font-bold text-primary tabular-nums">
              {formatPrice(order.total_amount, order.currency)}
            </p>
            <p className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
              <Calendar className="h-3 w-3" aria-hidden />
              {formatDateTime(order.placed_at)}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Durum İşlemleri
          </p>
          <OrderDetailControls
            orderId={order.id}
            currentStatus={order.status}
            csrfToken={csrfToken}
            initial={order}
          />
        </div>
      </header>

      {/* Items */}
      <section
        aria-label="Sipariş kalemleri"
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
      >
        <header className="border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold text-text">
            <Receipt className="h-4 w-4 text-muted" aria-hidden />
            Ürünler ({order.items.length})
          </h2>
        </header>
        <table className="w-full table-auto border-collapse text-left text-sm">
          <thead className="bg-background text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-5 py-2 font-medium">Ürün</th>
              <th className="px-5 py-2 text-center font-medium">Adet</th>
              <th className="px-5 py-2 text-right font-medium">Birim</th>
              <th className="px-5 py-2 text-right font-medium">Toplam</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-5 py-2.5">
                  <div className="flex flex-col">
                    <span className="font-medium text-text">{it.name}</span>
                    {it.notes ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] italic text-muted">
                        <StickyNote className="h-3 w-3" aria-hidden />
                        {it.notes}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-5 py-2.5 text-center tabular-nums">
                  {it.quantity}
                </td>
                <td className="px-5 py-2.5 text-right tabular-nums">
                  {formatPrice(it.price, order.currency)}
                </td>
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                  {formatPrice(
                    (
                      Number.parseFloat(it.price) * it.quantity
                    ).toFixed(2),
                    order.currency,
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t border-border bg-background">
              <td className="px-5 py-2.5 text-xs uppercase tracking-wider text-muted">
                Toplam
              </td>
              <td />
              <td />
              <td className="px-5 py-2.5 text-right font-heading text-lg font-bold text-primary tabular-nums">
                {formatPrice(order.total_amount, order.currency)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Notes */}
      {order.notes ? (
        <section
          aria-label="Müşteri notu"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <StickyNote className="h-3.5 w-3.5" aria-hidden />
            Müşteri Notu
          </h2>
          <p className="text-sm text-text">{order.notes}</p>
        </section>
      ) : null}

      {/* Timeline */}
      <section
        aria-label="Durum zaman çizelgesi"
        className="rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          Zaman Çizelgesi
        </h2>
        <ul className="space-y-2">
          {TIMELINE_FIELDS.map((field) => {
            const ts = order[field.key as keyof typeof order] as
              | string
              | null
              | undefined;
            const reached = Boolean(ts);
            return (
              <li
                key={field.key}
                className={
                  "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm " +
                  (reached
                    ? "border-primary/30 bg-primary/5 text-text"
                    : "border-border bg-background text-muted")
                }
              >
                <span className="font-medium">{field.label}</span>
                <span className="tabular-nums">
                  {ts ? formatDateTime(ts) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}