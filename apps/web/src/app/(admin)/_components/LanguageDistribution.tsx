interface LanguageDistributionProps {
  /**
   * Locale → ratio (0..1). Backend only includes locales that received
   * at least one event in the window; we don't synthesize zeros.
   */
  distribution: Record<string, number>;
}

interface Slice {
  locale: string;
  ratio: number;
  /** Hex-equivalent for SVG fill. Falls back to primary if unknown. */
  color: string;
}

/**
 * Static palette for the two locales V1 supports. Adding a third locale
 * later means extending this map AND widening the legend layout.
 *
 * The colors are picked to match the existing chrome (TR = brand
 * primary, EN = neutral muted) so the donut feels native to the admin
 * shell instead of competing with it.
 */
const LOCALE_COLORS: Record<string, string> = {
  tr: "rgb(var(--color-primary))",
  en: "rgb(var(--color-muted))",
};

const LOCALE_LABEL: Record<string, string> = {
  tr: "Türkçe",
  en: "English",
};

const SIZE = 120; // SVG viewBox side length
const CENTER = SIZE / 2;
const RADIUS = CENTER - 12;
const STROKE = 18;

/**
 * LanguageDistribution — donut chart of TR/EN usage share.
 *
 * V1 only supports two locales so we keep the geometry dead simple:
 *   - Single slice → full circle (100%)
 *   - Two slices → two arcs summing to 360°
 *   - Empty window → muted ring + "Henüz veri yok"
 *
 * Server-renderable; pure SVG, no client interactivity. The legend
 * underneath duplicates the percentages as text for accessibility
 * (screen readers read the chart's `<title>` element).
 */
export function LanguageDistribution({ distribution }: LanguageDistributionProps) {
  const slices: Slice[] = Object.entries(distribution)
    .filter(([, ratio]) => ratio > 0)
    .map(([locale, ratio]) => ({
      locale,
      ratio,
      color: LOCALE_COLORS[locale] ?? LOCALE_COLORS.tr,
    }))
    .sort((a, b) => b.ratio - a.ratio);

  const total = slices.reduce((acc, s) => acc + s.ratio, 0);
  const isEmpty = total === 0 || slices.length === 0;

  // Pre-compute SVG arc segments once. `strokeDasharray` + `strokeDashoffset`
  // is the trick that turns a `<circle>` into a donut: the visible arc
  // starts at 12 o'clock (-90°) and walks clockwise.
  const circumference = 2 * Math.PI * RADIUS;

  const segments = isEmpty
    ? []
    : (() => {
        let cursor = 0; // 0..1
        return slices.map((s) => {
          const start = cursor;
          cursor += s.ratio;
          return {
            ...s,
            dashOffset: -start * circumference,
            dashLength: s.ratio * circumference,
          };
        });
      })();

  return (
    <section
      aria-label="Dil dağılımı"
      className="rounded-xl border border-border bg-surface p-5 shadow-sm"
    >
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="font-heading text-base font-semibold text-text">
          Dil dağılımı
        </h2>
        <span className="text-xs text-muted">son {30} gün</span>
      </header>

      {isEmpty ? (
        <p className="rounded-md border border-dashed border-border bg-background px-3 py-4 text-center text-xs text-muted">
          Henüz dil verisi yok.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-around">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`Dil kullanım oranı: ${slices
              .map((s) => `${LOCALE_LABEL[s.locale] ?? s.locale} ${Math.round(s.ratio * 100)}%`)
              .join(", ")}`}
            className="h-28 w-28 shrink-0"
          >
            <title>Dil kullanım oranı</title>
            {/* Track */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="rgb(var(--color-background))"
              strokeWidth={STROKE}
            />
            {/* Rotated -90° so the arc starts at 12 o'clock */}
            <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
              {segments.map((seg) => (
                <circle
                  key={seg.locale}
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE}
                  strokeDasharray={`${seg.dashLength} ${circumference}`}
                  strokeDashoffset={seg.dashOffset}
                  strokeLinecap="butt"
                />
              ))}
            </g>
          </svg>

          <ul className="space-y-1.5 text-sm">
            {slices.map((s) => (
              <li
                key={s.locale}
                className="flex items-center gap-2 text-text"
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-medium">
                  {LOCALE_LABEL[s.locale] ?? s.locale}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {Math.round(s.ratio * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
