import {
  Eye,
  Globe2,
  MessageCircle,
  Phone,
  QrCode,
  type LucideIcon,
} from "lucide-react";

import type { AnalyticsEventCounts, AnalyticsEventType } from "@/lib/api-admin";

interface EventBreakdownProps {
  counts: AnalyticsEventCounts;
  /**
   * Optional total used to render bar widths as a percentage of the
   * dominant event. Defaults to the sum of all five counts so the
   * longest bar is always full-width.
   */
  total?: number;
}

interface RowSpec {
  type: AnalyticsEventType;
  label: string;
  icon: LucideIcon;
}

/**
 * Order is intentional — it puts the most "headline" metric (menu_view)
 * on top, and groups conversational / conversion events at the bottom.
 * V1 doesn't expose reordering; the backend returns the same five keys
 * for every tenant.
 */
const ROWS: RowSpec[] = [
  { type: "menu_view", label: "Menü görüntülenme", icon: Eye },
  { type: "language_change", label: "Dil değiştirme", icon: Globe2 },
  { type: "qr_open", label: "QR tarama", icon: QrCode },
  { type: "whatsapp_click", label: "WhatsApp tıklama", icon: MessageCircle },
  { type: "phone_click", label: "Telefon tıklama", icon: Phone },
];

/**
 * EventBreakdown — horizontal bar list of the five public event types.
 *
 * Server-renderable (no hooks / browser APIs). Each row shows the event
 * label, the absolute count (tr-TR thousands), and a thin bar whose
 * width is `count / max` so the most common event always reads at 100%.
 * Zero-count rows still render so the dashboard's "five events" layout
 * stays consistent — they just collapse to a flat rail.
 */
export function EventBreakdown({ counts, total }: EventBreakdownProps) {
  const max = Math.max(1, ...ROWS.map((r) => counts[r.type] ?? 0));
  const computedTotal =
    typeof total === "number"
      ? total
      : ROWS.reduce((acc, r) => acc + (counts[r.type] ?? 0), 0);
  const isEmpty = computedTotal === 0;

  return (
    <section
      aria-label="Olay türü kırılımı"
      className="rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-base font-semibold text-text">
          Olay türü kırılımı
        </h2>
        <span className="text-xs text-muted">
          toplam {computedTotal.toLocaleString("tr-TR")} olay
        </span>
      </header>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted">
          Henüz olay kaydedilmedi. Public sayfa açıldığında burada görünecek.
        </p>
      ) : (
        <ul className="space-y-3">
          {ROWS.map((row) => {
            const value = counts[row.type] ?? 0;
            const pct = Math.round((value / max) * 100);
            const Icon = row.icon;
            return (
              <li key={row.type} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-text">
                      {row.label}
                    </p>
                    <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-text">
                      {value.toLocaleString("tr-TR")}
                    </p>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`${row.label} yüzdesi`}
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="mt-1 h-2 w-full overflow-hidden rounded-full bg-background"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
