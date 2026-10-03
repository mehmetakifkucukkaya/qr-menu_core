import type { AdminOrderStatus } from "@/lib/api-admin";

interface OrderStatusBadgeProps {
  status: AdminOrderStatus;
}

/**
 * OrderStatusBadge — colored pill for the 6 lifecycle states.
 *
 * Tones are tuned to feel like a status pipeline:
 *   - pending / confirmed: cool blue (waiting)
 *   - preparing: amber (active)
 *   - ready: emerald (success waiting for pickup)
 *   - delivered: green (terminal success)
 *   - cancelled: red (terminal failure)
 */
export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config: Record<AdminOrderStatus, { label: string; tone: string }> = {
    pending: {
      label: "Beklemede",
      tone: "bg-blue-100 text-blue-800 ring-blue-200",
    },
    confirmed: {
      label: "Onaylandı",
      tone: "bg-indigo-100 text-indigo-800 ring-indigo-200",
    },
    preparing: {
      label: "Hazırlanıyor",
      tone: "bg-warning-soft text-warning ring-warning/25",
    },
    ready: {
      label: "Hazır",
      tone: "bg-success-soft text-success ring-success/25",
    },
    delivered: {
      label: "Teslim Edildi",
      tone: "bg-success-soft text-success ring-success/25",
    },
    cancelled: {
      label: "İptal Edildi",
      tone: "bg-danger-soft text-danger ring-danger/25",
    },
  };
  const { label, tone } = config[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${tone}`}
    >
      {label}
    </span>
  );
}