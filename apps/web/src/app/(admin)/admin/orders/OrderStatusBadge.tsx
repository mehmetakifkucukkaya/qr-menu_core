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
      tone: "bg-amber-100 text-amber-800 ring-amber-200",
    },
    ready: {
      label: "Hazır",
      tone: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    },
    delivered: {
      label: "Teslim Edildi",
      tone: "bg-green-100 text-green-800 ring-green-200",
    },
    cancelled: {
      label: "İptal Edildi",
      tone: "bg-red-100 text-red-800 ring-red-200",
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