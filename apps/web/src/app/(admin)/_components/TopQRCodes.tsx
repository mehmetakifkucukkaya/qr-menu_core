import Link from "next/link";
import { ChevronRight, QrCode } from "lucide-react";

import type { AnalyticsTopQRCode } from "@/lib/api-admin";

interface TopQRCodesProps {
  /**
   * Up to 5 QR rows ordered by `scan_count` desc (backend already
   * orders, but we re-sort defensively so callers can pass an unfiltered
   * subset without breaking the visual ranking).
   */
  codes: AnalyticsTopQRCode[];
}

/**
 * TopQRCodes — sidebar-list of the top 5 QR codes by scan count.
 *
 * Each row links to the QR detail page so the operator can drop into
 * the existing edit / preview / download flow without backtracking.
 * Empty state nudges the operator to the QR management page (where
 * they'll learn that scan_count needs a `qr_open` event to move).
 *
 * Server-renderable.
 */
export function TopQRCodes({ codes }: TopQRCodesProps) {
  const sorted = [...codes].sort((a, b) => b.scan_count - a.scan_count);
  const max = Math.max(1, ...sorted.map((c) => c.scan_count));
  const isEmpty = sorted.length === 0;

  return (
    <section
      aria-label="En çok taranan QR kodlar"
      className="rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-base font-semibold text-text">
          En çok taranan QR kodlar
        </h2>
        <span className="text-xs text-muted">
          ilk {Math.min(5, sorted.length)}
        </span>
      </header>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted">
          Henüz QR kodunuz yok.{" "}
          <Link
            href="/admin/qr-codes/new"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            İlk QR kodu oluşturun
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((code, idx) => {
            const pct = Math.round((code.scan_count / max) * 100);
            return (
              <li key={code.id}>
                <Link
                  href={`/admin/qr-codes/${code.id}`}
                  className="group flex items-center gap-3 py-3 transition hover:bg-background/40 focus:outline-none focus-visible:bg-background/40"
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                  >
                    <QrCode className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-text group-hover:text-primary">
                        <span className="mr-1 font-mono text-xs text-muted">
                          #{idx + 1}
                        </span>
                        {code.label || (
                          <span className="italic text-muted">(etiketsiz)</span>
                        )}
                      </p>
                      <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-text">
                        {code.scan_count.toLocaleString("tr-TR")}
                      </p>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`${code.label} tarama oranı`}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-background"
                    >
                      <div
                        className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
                        style={{ width: `${Math.max(2, pct)}%` }}
                      />
                    </div>
                  </div>
                  <ChevronRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted transition group-hover:text-primary"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!isEmpty ? (
        <p className="mt-3 text-right">
          <Link
            href="/admin/qr-codes"
            className="text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            Tüm QR kodlar →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
