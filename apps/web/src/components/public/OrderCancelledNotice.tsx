import { X } from "lucide-react";

import { formatDateTime } from "@/lib/datetime";

export interface OrderCancelledNoticeProps {
  /** When the kitchen cancelled it (ISO), if known. */
  cancelledAt: string | null;
  /** Turkish label of the reason the kitchen chose; `null` for orders cancelled before reasons existed. */
  reasonLabel: string | null;
}

/** The last step of the customer's order timeline when the kitchen cancelled the order. */
export function OrderCancelledNotice({ cancelledAt, reasonLabel }: OrderCancelledNoticeProps) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
        <X className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-danger">İptal Edildi</p>
        <p className="text-xs text-muted">
          Sipariş iptal edildi
          {cancelledAt
            ? ` · ${formatDateTime(cancelledAt, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}`
            : null}
          .
        </p>
        {reasonLabel ? <p className="mt-1 text-sm font-semibold text-text">Neden: {reasonLabel}</p> : null}
      </div>
    </li>
  );
}
