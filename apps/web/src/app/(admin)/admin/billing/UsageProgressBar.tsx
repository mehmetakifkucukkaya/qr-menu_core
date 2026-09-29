import clsx from "clsx";
import { Infinity as InfinityIcon } from "lucide-react";

import type { PlanUsageMetric } from "@/types/admin";

interface UsageProgressBarProps {
  /** Row label (e.g. "Aylık Görüntülenme"). */
  label: string;
  /** Value triple from `usage.metrics[*]`. */
  value: PlanUsageMetric;
  /** Optional tooltip / context shown beneath the bar. */
  hint?: string;
}

/**
 * Color threshold for the bar fill — mirrors the kitchen "limit reached"
 * UX pattern so operators instantly recognise the traffic-light scale.
 *
 *   < 60% → green / safe
 *   60-80% → amber / warning
 *   > 80% → red / critical
 *
 * Unlimited (limit === null) → muted stripe pattern + "Sınırsız" label.
 */
function barTone(pct: number | null): { bar: string; text: string } {
  if (pct === null) {
    return { bar: "bg-muted/40", text: "text-muted" };
  }
  if (pct < 60) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (pct < 80) return { bar: "bg-amber-500", text: "text-amber-700" };
  return { bar: "bg-red-500", text: "text-red-700" };
}

/**
 * UsageProgressBar — Sprint B2.
 *
 * Renders a labelled horizontal progress bar with the "X / Y" count,
 * percent chip, and traffic-light colour. When `value.limit` is null
 * (unlimited tier) we render a muted stripe + "sınırsız" text instead
 * of a percent — matches the "you've hit the top tier" semantics the
 * OPS tier is built around (D-026).
 */
export function UsageProgressBar({ label, value, hint }: UsageProgressBarProps) {
  const isUnlimited = value.limit === null;
  const tone = barTone(value.pct);
  // Cap visual width at 100% so a counter overrun (counter > limit) still
  // renders a full bar — the operator needs to see "this is full" even
  // when the limit has already been breached.
  const visualPct = value.pct === null ? 0 : Math.min(100, Math.max(0, value.pct));
  const percentLabel =
    value.pct === null
      ? "—"
      : `${value.pct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-text">{label}</span>
        <span
          className={clsx(
            "font-mono text-xs font-semibold tabular-nums",
            isUnlimited ? "text-muted" : tone.text,
          )}
        >
          {isUnlimited ? (
            <>
              <InfinityIcon
                className="mr-0.5 inline h-3.5 w-3.5 align-text-bottom"
                aria-hidden
              />
              {value.used.toLocaleString("tr-TR")} / sınırsız
            </>
          ) : (
            <>
              {value.used.toLocaleString("tr-TR")} /{" "}
              {value.limit?.toLocaleString("tr-TR")} · {percentLabel}
            </>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} kullanım oranı`}
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? undefined : 100}
        aria-valuenow={isUnlimited ? undefined : Math.round(value.pct ?? 0)}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30"
      >
        <div
          className={clsx(
            "h-full rounded-full transition-[width] duration-300",
            isUnlimited
              ? "w-full bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.08)_0_6px,transparent_6px_12px)]"
              : tone.bar,
          )}
          style={isUnlimited ? undefined : { width: `${visualPct}%` }}
        />
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}