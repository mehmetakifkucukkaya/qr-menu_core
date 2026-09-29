import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/Card";
import type { Plan } from "@/types/admin";
import { PLAN_LABEL, PLAN_PRICE_TRY, PLAN_TONE } from "@/types/admin";

interface PlanCardProps {
  /** Plan tier this card represents. */
  plan: Plan;
  /** True when the card is the operator's currently active plan. */
  isActive: boolean;
  /** Optional caption shown above the title (e.g. "Mevcut plan"). */
  caption?: string;
  /** When true, render the highlight border + badge (used on the
   *  featured tier in the comparison table). */
  highlighted?: boolean;
}

/**
 * Tailwind class fragments for the 4 plan tones. We split lookup tables
 * (one per property) so unused combinations can be tree-shaken; the
 * `tone` key keeps the API surface stable.
 */
const TONE_RING: Record<string, string> = {
  slate: "ring-slate-400",
  blue: "ring-blue-400",
  amber: "ring-amber-400",
  violet: "ring-violet-400",
};

const TONE_BG: Record<string, string> = {
  slate: "bg-slate-50",
  blue: "bg-blue-50",
  amber: "bg-amber-50",
  violet: "bg-violet-50",
};

const TONE_TEXT: Record<string, string> = {
  slate: "text-slate-700",
  blue: "text-blue-700",
  amber: "text-amber-700",
  violet: "text-violet-700",
};

/**
 * PlanCard — single plan tier summary card (Sprint B2).
 *
 * Renders:
 *   - Tone-coloured pill with the tier name + price (₺/ay placeholder).
 *   - Optional "Aktif plan" / custom caption badge.
 *   - Optional highlight ring (used by the comparison-table's featured
 *     tier; the `<LimitComparisonTable>` passes `highlighted`).
 *
 * The card is intentionally read-only — the operator edits plan/feature
 * via the dedicated `<PlanSettingsForm>` mounted elsewhere on the page.
 * Keeping the card dumb lets the comparison table reuse it as a column
 * header without needing to know about form state.
 */
export function PlanCard({
  plan,
  isActive,
  caption,
  highlighted = false,
}: PlanCardProps) {
  const tone = PLAN_TONE[plan];

  return (
    <Card
      variant="outline"
      className={clsx(
        "flex flex-col gap-4",
        isActive && clsx("ring-2 ring-offset-2 ring-offset-background", TONE_RING[tone]),
        highlighted && !isActive && "border-primary/40",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span
            className={clsx(
              "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              TONE_BG[tone],
              TONE_TEXT[tone],
            )}
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {PLAN_LABEL[plan]}
          </span>
          <p className="font-heading text-2xl font-bold text-text">
            ₺{PLAN_PRICE_TRY[plan].toLocaleString("tr-TR")}
            <span className="ml-1 text-sm font-normal text-muted">/ ay</span>
          </p>
        </div>
        {isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Check className="h-3 w-3" aria-hidden />
            Aktif plan
          </span>
        ) : caption ? (
          <span className="rounded-full bg-muted/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {caption}
          </span>
        ) : null}
      </header>
      <p className="text-xs text-muted">
        Plan kartı salt okunurdur. Plan değişikliği için yandaki formu
        kullanın.
      </p>
    </Card>
  );
}