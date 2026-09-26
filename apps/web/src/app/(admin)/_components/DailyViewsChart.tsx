import type { AnalyticsDailyView } from "@/lib/api-admin";

interface DailyViewsChartProps {
  /**
   * Per-day totals from the analytics overview. May be shorter than
   * `windowDays` if the tenant has events for fewer days (empty days
   * simply render as zero-height bars in the chart, so the visual
   * window stays stable across tenants).
   */
  data: AnalyticsDailyView[];
  /** Total number of days the chart should visualize. */
  windowDays?: number;
}

const DEFAULT_HEIGHT = 140;
const DEFAULT_WIDTH = 600; // viewBox width — SVG scales responsively
const PADDING_X = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24; // room for date labels under each bar
const BAR_GAP = 2;

/**
 * DailyViewsChart — inline SVG bar chart of the last N days of `menu_view`
 * events. V1 keeps it minimal:
 *   - No hover, no tooltip, no axis lines — the operator wants a glance,
 *     not a chart editor.
 *   - Days without events render as a flat rail (height 0) so the bars
 *     stay aligned to today on the right.
 *   - The most recent day sits on the right edge; oldest on the left.
 *
 * Server-renderable. Colors come from Tailwind tokens (`primary`,
 * `primary/40` for the rail) so the per-business theme propagates.
 */
export function DailyViewsChart({
  data,
  windowDays = 30,
}: DailyViewsChartProps) {
  // Build a full-window lookup so absent days fill in as zero rather
  // than collapsing the bars. `data` from the backend is ascending by
  // date; we just re-key by ISO date.
  const countByDate = new Map<string, number>();
  for (const row of data) {
    countByDate.set(row.date, row.count);
  }

  const today = new Date();
  // Render oldest → newest so today ends up on the right edge.
  const days: { date: string; count: number; dateObj: Date }[] = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - offset);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, count: countByDate.get(iso) ?? 0, dateObj: d });
  }

  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((acc, d) => acc + d.count, 0);

  const chartWidth = DEFAULT_WIDTH - PADDING_X * 2;
  const chartHeight = DEFAULT_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const barWidth = Math.max(
    1,
    (chartWidth - BAR_GAP * (days.length - 1)) / Math.max(1, days.length),
  );

  // Pick a sparse date-label cadence so the axis doesn't get crowded.
  // Roughly one label every ~7 cells for 30-day, every ~10 for 90-day.
  const labelEvery = days.length > 60 ? 14 : days.length > 30 ? 7 : 5;

  return (
    <section
      aria-label="Günlük görüntülenme"
      className="rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-base font-semibold text-text">
          Günlük görüntülenme
        </h2>
        <span className="text-xs text-muted">
          son {windowDays} gün · toplam {total.toLocaleString("tr-TR")}
        </span>
      </header>

      {total === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted">
          Henüz günlük veri yok. Public sayfa açıldıkça burada görünecek.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${DEFAULT_WIDTH} ${DEFAULT_HEIGHT}`}
          role="img"
          aria-label={`Son ${windowDays} günde günlük menü görüntülenme grafiği`}
          preserveAspectRatio="none"
          className="h-36 w-full"
        >
          {/* Rail — faint line under the bars so empty days read as
              "zero" instead of "missing data". */}
          <line
            x1={PADDING_X}
            x2={PADDING_X + chartWidth}
            y1={PADDING_TOP + chartHeight}
            y2={PADDING_TOP + chartHeight}
            stroke="rgb(var(--color-border))"
            strokeWidth={1}
          />
          {days.map((day, i) => {
            const x = PADDING_X + i * (barWidth + BAR_GAP);
            const barHeight =
              max === 0 ? 0 : Math.round((day.count / max) * chartHeight);
            const y = PADDING_TOP + chartHeight - barHeight;
            const isLast = i === days.length - 1;
            return (
              <g key={day.date}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(0, barHeight)}
                  rx={Math.min(2, barWidth / 2)}
                  className={isLast ? "fill-primary" : "fill-primary/70"}
                >
                  <title>
                    {day.date} · {day.count} görüntülenme
                  </title>
                </rect>
                {i % labelEvery === 0 || isLast ? (
                  <text
                    x={x + barWidth / 2}
                    y={PADDING_TOP + chartHeight + 14}
                    textAnchor="middle"
                    className="fill-muted"
                    fontSize={10}
                  >
                    {formatAxisDate(day.dateObj)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}

/** Compact axis label: "26 Eyl" / "26 Sep" — we keep Turkish month names. */
function formatAxisDate(d: Date): string {
  const months = [
    "Oca",
    "Şub",
    "Mar",
    "Nis",
    "May",
    "Haz",
    "Tem",
    "Ağu",
    "Eyl",
    "Eki",
    "Kas",
    "Ara",
  ];
  return `${d.getDate()} ${months[d.getMonth()] ?? ""}`.trim();
}
