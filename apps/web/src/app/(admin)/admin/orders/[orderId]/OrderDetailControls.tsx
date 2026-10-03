"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Bell, PackageCheck, X } from "lucide-react";
import {
  updateOrderStatus,
  AdminApiError,
  type AdminOrderDetail,
  type AdminOrderStatus,
} from "@/lib/api-admin";

interface OrderDetailControlsProps {
  orderId: number;
  currentStatus: AdminOrderStatus;
  csrfToken: string | null;
  /** Server-rendered payload — used as the initial state for live
   *  updates without re-fetching the full detail page. */
  initial: AdminOrderDetail;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * OrderDetailControls — client island that owns the status-update
 * buttons + 30 s background polling.
 *
 * Why polling on the detail page?
 *   - The kitchen display (Sprint 8C) will be the primary "live" view,
 *     but operators often drill into one order to read notes and want
 *     the latest state without hitting refresh.
 *   - 30 s is light enough that we don't hammer the backend.
 *
 * Allowed transitions come from the backend state machine
 * (`apps.orders.services.STATUS_TRANSITIONS`) and are mirrored here:
 *   - pending → confirmed | cancelled
 *   - confirmed → preparing | cancelled
 *   - preparing → ready | cancelled
 *   - ready → delivered
 *   - delivered / cancelled → (terminal — no buttons)
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
    { next: "preparing", label: "Hazırlanıyor", icon: ChefHat, primary: true },
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

export function OrderDetailControls({
  orderId,
  currentStatus: initialStatus,
  csrfToken,
  initial,
}: OrderDetailControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<AdminOrderStatus>(initialStatus);

  // 30 s polling — refreshes the route via router.refresh() so the
  // timestamps + status badges re-render with the latest server data.
  // Skipped entirely once the order reaches a terminal state.
  useEffect(() => {
    const isTerminal =
      liveStatus === "delivered" || liveStatus === "cancelled";
    if (isTerminal) return;
    const timer = setInterval(() => {
      startTransition(() => router.refresh());
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router, liveStatus]);

  const handleUpdate = async (next: AdminOrderStatus) => {
    if (!csrfToken) {
      setError("CSRF token bulunamadı. Sayfayı yenileyin.");
      return;
    }
    setError(null);
    try {
      const result = await updateOrderStatus(orderId, next, { csrfToken });
      setLiveStatus(result.status);
      // Re-render the whole page so timestamps + items reflect the new state.
      router.refresh();
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

  const actions = NEXT_BY_STATUS[liveStatus];

  return (
    <div className="flex flex-col gap-2">
      {actions.length === 0 ? (
        <p className="inline-flex items-center gap-2 rounded-md bg-background px-3 py-2 text-xs italic text-muted">
          Bu sipariş terminal bir durumda ({liveStatus}). Başka işlem
          yapılamaz.
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
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 " +
                  (a.primary
                    ? "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary"
                    : a.danger
                      ? "border border-danger/30 bg-danger-soft text-danger hover:bg-danger/10 focus-visible:ring-danger"
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
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}