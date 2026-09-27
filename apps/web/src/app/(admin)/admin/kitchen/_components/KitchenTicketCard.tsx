"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChefHat,
  Bell,
  PackageCheck,
  X,
  MapPin,
  Hash,
  User,
  Clock,
  StickyNote,
} from "lucide-react";

import {
  updateOrderStatus,
  AdminApiError,
  type AdminOrderStatus,
} from "@/lib/api-admin";

interface KitchenTicketCardProps {
  orderId: number;
  orderNumber: string;
  status: AdminOrderStatus;
  tableNumber: string;
  customerName: string;
  customerPhone: string;
  branchName: string | null;
  timeSincePlacedSeconds: number;
  placedAt: string;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    notes: string;
  }>;
  csrfToken: string | null;
}

/**
 * KitchenTicketCard — single active ticket shown on the kitchen display.
 *
 * Layout (top → bottom):
 *   1. Header: order_number (mono, large) + status badge
 *   2. Meta line: table + placed-at
 *   3. Items list (qty × name, per-line notes inline)
 *   4. Action row: state-machine buttons that hit
 *      `POST /api/v1/admin/orders/{id}/status/`
 *
 * Pulse className
 *   `kitchen-ticket-pending` is applied to the card root while the ticket
 *   is in a pre-preparation state (`pending` or `confirmed`). The CSS keyframe
 *   lives in `globals.css` and respects `prefers-reduced-motion`.
 *
 * Polling is owned by the parent — the card itself does NOT auto-refresh.
 * It triggers a `router.refresh()` only after a successful state transition,
 *   which causes Next.js to re-render the page and re-run the
 *   `fetchKitchenTickets()` call server-side.
 */
const NEXT_BY_STATUS: Record<
  AdminOrderStatus,
  Array<{
    next: AdminOrderStatus;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    primary?: boolean;
    danger?: boolean;
  }>
> = {
  pending: [
    { next: "confirmed", label: "Onayla", icon: Check, primary: true },
    { next: "cancelled", label: "İptal", icon: X, danger: true },
  ],
  confirmed: [
    { next: "preparing", label: "Hazırlamaya Başla", icon: ChefHat, primary: true },
    { next: "cancelled", label: "İptal", icon: X, danger: true },
  ],
  preparing: [
    { next: "ready", label: "Hazır", icon: Bell, primary: true },
    { next: "cancelled", label: "İptal", icon: X, danger: true },
  ],
  ready: [
    { next: "delivered", label: "Teslim Edildi", icon: PackageCheck, primary: true },
  ],
  delivered: [],
  cancelled: [],
};

const STATUS_BADGE_LABEL: Record<AdminOrderStatus, string> = {
  pending: "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  delivered: "Teslim Edildi",
  cancelled: "İptal Edildi",
};

const STATUS_BADGE_CLASS: Record<AdminOrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  confirmed: "bg-sky-100 text-sky-800 border-sky-300",
  preparing: "bg-violet-100 text-violet-800 border-violet-300",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-300",
  delivered: "bg-gray-100 text-gray-700 border-gray-300",
  cancelled: "bg-rose-100 text-rose-800 border-rose-300",
};

function formatAge(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function KitchenTicketCard({
  orderId,
  orderNumber,
  status,
  tableNumber,
  customerName,
  customerPhone,
  branchName,
  timeSincePlacedSeconds,
  placedAt,
  items,
  csrfToken,
}: KitchenTicketCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const actions = NEXT_BY_STATUS[status] ?? [];
  const canPulse = status === "pending" || status === "confirmed";
  const isTerminal =
    status === "delivered" || status === "cancelled";

  const handleUpdate = async (next: AdminOrderStatus) => {
    if (!csrfToken) {
      setError("CSRF token bulunamadı. Sayfayı yenileyin.");
      return;
    }
    setError(null);
    try {
      await updateOrderStatus(orderId, next, { csrfToken });
      // Re-render the kitchen list with fresh server data — pulls the
      // ticket either to the next tab or out of the active list.
      startTransition(() => router.refresh());
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Durum güncellenemedi.";
      setError(message);
    }
  };

  return (
    <article
      aria-label={`Sipariş ${orderNumber}`}
      className={
        "flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition " +
        (canPulse
          ? "kitchen-ticket-pending border-amber-300/60"
          : "border-border")
      }
    >
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 font-mono text-lg font-bold text-text">
            <Hash className="h-4 w-4 text-muted" aria-hidden />
            {orderNumber}
          </p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted">
            <Clock className="h-3 w-3" aria-hidden />
            {formatPlacedAt(placedAt)} •{" "}
            <span className="tabular-nums font-semibold">
              {formatAge(timeSincePlacedSeconds)}
            </span>
          </p>
        </div>
        <span
          className={
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider " +
            (STATUS_BADGE_CLASS[status] ?? "border-border bg-surface text-text")
          }
        >
          {STATUS_BADGE_LABEL[status] ?? status}
        </span>
      </header>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          <span className="font-mono text-base font-bold text-text">
            {tableNumber || "—"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <User className="h-3.5 w-3.5" aria-hidden />
          {customerName}
        </span>
        <span className="font-mono">{customerPhone}</span>
        {branchName ? <span>· Şube: {branchName}</span> : null}
      </div>

      {/* Items */}
      <ul className="space-y-1.5 border-t border-border pt-3 text-sm">
        {items.map((it) => (
          <li key={it.id} className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-2">
              <span className="inline-flex h-6 min-w-[2rem] items-center justify-center rounded-md bg-primary/10 px-1.5 font-mono text-sm font-bold tabular-nums text-primary">
                ×{it.quantity}
              </span>
              <span className="font-medium text-text">{it.name}</span>
            </div>
            {it.notes ? (
              <p className="ml-[2.5rem] inline-flex items-start gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] italic text-amber-900">
                <StickyNote className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden />
                {it.notes}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Actions */}
      <footer className="mt-auto border-t border-border pt-3">
        {isTerminal ? (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-2 text-xs italic text-muted">
            Bu sipariş terminal bir durumda ({status}). Başka işlem yapılamaz.
          </p>
        ) : actions.length === 0 ? (
          <p className="inline-flex items-center gap-1.5 rounded-md bg-background px-3 py-2 text-xs italic text-muted">
            Bu durum için işlem tanımlı değil.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.next}
                  type="button"
                  onClick={() => handleUpdate(a.next)}
                  disabled={pending}
                  className={
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 " +
                    (a.primary
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary"
                      : a.danger
                        ? "border border-accent/40 bg-accent/5 text-accent hover:bg-accent/10 focus:ring-accent"
                        : "border border-border bg-surface text-text hover:bg-background focus:ring-primary")
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {a.label}
                </button>
              );
            })}
            {pending ? (
              <span className="text-xs italic text-muted">Güncelleniyor…</span>
            ) : null}
          </div>
        )}
        {error ? (
          <p
            role="alert"
            className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-2.5 py-1.5 text-xs font-medium text-accent"
          >
            {error}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
