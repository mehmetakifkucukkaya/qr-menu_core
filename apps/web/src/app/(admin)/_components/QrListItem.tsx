import Link from "next/link";
import { Edit3, Hash, MapPin, QrCode } from "lucide-react";

import { DeleteQRButton } from "../admin/qr-codes/[qrId]/DeleteQRButton";
import type { AdminQRCode } from "@/types/admin";

interface QrListItemProps {
  /** The QR row to render. */
  qr: AdminQRCode;
  /** CSRF token — forwarded to the delete button client island. */
  csrfToken: string | null;
}

/**
 * QrListItem — single row in the QR codes table.
 *
 * Server-renderable. The destructive button is a tiny client island
 * (`DeleteQRButton`) that lives next to its parent page (`[qrId]`) for
 * colocation with the rest of that route's client logic.
 *
 * Menu / branch / org `name` fields come pre-resolved by the page so we
 * don't need to issue N additional fetches — the parent maps
 * `qr.branch_id` etc. onto a name via the lookup tables it loads
 * server-side.
 */
export function QrListItem({ qr, csrfToken }: QrListItemProps) {
  const branchName = qr.branch?.name ?? null;

  return (
    <tr className="border-t border-border text-sm text-text transition hover:bg-background/60">
      {/* Label + org context */}
      <td className="px-4 py-3 align-middle">
        <Link
          href={`/admin/qr-codes/${qr.id}`}
          className="group inline-flex items-center gap-2 font-medium text-text hover:text-primary focus:outline-none focus-visible:text-primary"
        >
          <QrCode className="h-4 w-4 text-muted transition group-hover:text-primary" />
          {qr.label || (
            <span className="italic text-muted">(etiketsiz)</span>
          )}
        </Link>
        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
          #{qr.id} · {qr.organization.name}
        </p>
      </td>

      {/* Menu name */}
      <td className="px-4 py-3 align-middle">
        <span className="text-text">{qr.menu.name}</span>
        <span className="block font-mono text-[10px] uppercase tracking-wider text-muted">
          /{qr.menu.slug}
        </span>
      </td>

      {/* Branch name (optional) */}
      <td className="px-4 py-3 align-middle">
        {branchName ? (
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            <MapPin className="h-3 w-3" aria-hidden />
            {branchName}
          </span>
        ) : (
          <span className="text-xs italic text-muted">İşletme geneli</span>
        )}
      </td>

      {/* Table number */}
      <td className="px-4 py-3 align-middle">
        {qr.table_number ? (
          <span className="inline-flex items-center gap-1 text-xs text-text">
            <Hash className="h-3 w-3 text-muted" aria-hidden />
            {qr.table_number}
          </span>
        ) : (
          <span className="text-xs italic text-muted">—</span>
        )}
      </td>

      {/* Scan count */}
      <td className="px-4 py-3 text-center align-middle">
        <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs font-semibold tabular-nums text-text">
          {qr.scan_count.toLocaleString("tr-TR")}
        </span>
      </td>

      {/* Active badge */}
      <td className="px-4 py-3 align-middle">
        <span
          className={
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
            (qr.is_active
              ? "bg-primary/10 text-primary"
              : "bg-muted/20 text-muted")
          }
        >
          {qr.is_active ? "Yayında" : "Pasif"}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3 align-middle">
        <div className="flex items-center justify-end gap-1.5">
          <Link
            href={`/admin/qr-codes/${qr.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Edit3 className="h-3 w-3" />
            Detay
          </Link>
          <DeleteQRButton id={qr.id} csrfToken={csrfToken} />
        </div>
      </td>
    </tr>
  );
}
