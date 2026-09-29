import clsx from "clsx";
import { Check, X } from "lucide-react";

import type {
  FeatureKey,
  PlanLimit,
  PlanLimitKey,
  PlanLimitMatrix,
} from "@/types/admin";
import {
  FEATURE_KEYS,
  FEATURE_LABEL,
  PLAN_LABEL,
  PLAN_TONE,
  PLAN_LIMIT_LABEL,
} from "@/types/admin";

interface LimitComparisonTableProps {
  /** Payload of `GET /api/v1/admin/billing/limits/`. */
  matrix: PlanLimitMatrix;
}

/**
 * LimitComparisonTable — Sprint B2.
 *
 * 4-column comparison grid (basic / pro / orders / ops):
 *   - Header row: plan tier name + tone-coloured chip
 *   - One row per `PlanLimitKey` — value or "Sınırsız"
 *   - One row per feature flag — check / x icon
 *
 * The active tier (matrix.tiers[i].is_current) gets the highlight ring
 * + a tint background so operators see at a glance which plan they're
 * on. Spec drift: backend tier uses `id`, not `plan`; price isn't
 * exposed so we drop the ₺ column (no API source).
 */
export function LimitComparisonTable({ matrix }: LimitComparisonTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-background/40">
            <th
              scope="col"
              className="w-1/5 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted"
            >
              Özellik
            </th>
            {matrix.tiers.map((tier) => (
              <TierHeader key={tier.id} tier={tier} />
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Resource limit rows — one per PLAN_LIMIT_LABEL key. */}
          {(Object.keys(PLAN_LIMIT_LABEL) as PlanLimitKey[]).map((key) => (
            <LimitRow key={key} limitKey={key} matrix={matrix} />
          ))}

          {/* Feature flag rows — separated by a small divider. */}
          <tr>
            <th
              colSpan={matrix.tiers.length + 1}
              className="border-b border-t border-border bg-background/40 px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted"
            >
              Özellik bayrakları
            </th>
          </tr>
          {FEATURE_KEYS.map((key) => (
            <FeatureRow key={key} featureKey={key} matrix={matrix} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TierHeaderProps {
  tier: PlanLimit;
}

function TierHeader({ tier }: TierHeaderProps) {
  const tone = PLAN_TONE[tier.id];
  return (
    <th
      scope="col"
      className={clsx(
        "border-l border-border px-4 py-3 align-top",
        tier.is_current && "bg-primary/5 ring-2 ring-inset ring-primary/30",
      )}
    >
      <div className="flex flex-col gap-1">
        <span
          className={clsx(
            "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            TIER_HEADER_BG[tone],
            TIER_HEADER_TEXT[tone],
          )}
        >
          {PLAN_LABEL[tier.id]}
        </span>
        {tier.is_current ? (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Aktif planınız
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider text-muted">
            &nbsp;
          </span>
        )}
      </div>
    </th>
  );
}

const TIER_HEADER_BG: Record<string, string> = {
  slate: "bg-slate-100",
  blue: "bg-blue-100",
  amber: "bg-amber-100",
  violet: "bg-violet-100",
};
const TIER_HEADER_TEXT: Record<string, string> = {
  slate: "text-slate-700",
  blue: "text-blue-700",
  amber: "text-amber-700",
  violet: "text-violet-700",
};

interface LimitRowProps {
  limitKey: PlanLimitKey;
  matrix: PlanLimitMatrix;
}

function LimitRow({ limitKey, matrix }: LimitRowProps) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className="px-4 py-2.5 text-left align-middle font-medium text-text"
      >
        {PLAN_LIMIT_LABEL[limitKey]}
      </th>
      {matrix.tiers.map((tier) => {
        const raw = tier.limits[limitKey];
        const isUnlimited = raw === null;
        const display = isUnlimited
          ? "Sınırsız"
          : (raw as number).toLocaleString("tr-TR");
        return (
          <td
            key={tier.id}
            className={clsx(
              "border-l border-border px-4 py-2.5 align-middle text-sm tabular-nums",
              tier.is_current && "bg-primary/5",
              isUnlimited && "font-medium text-muted",
              !isUnlimited && "text-text",
            )}
          >
            {display}
          </td>
        );
      })}
    </tr>
  );
}

interface FeatureRowProps {
  featureKey: FeatureKey;
  matrix: PlanLimitMatrix;
}

function FeatureRow({ featureKey, matrix }: FeatureRowProps) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className="px-4 py-2 text-left align-middle font-medium text-text"
      >
        {FEATURE_LABEL[featureKey]}
      </th>
      {matrix.tiers.map((tier) => {
        const enabled = tier.features[featureKey] === true;
        return (
          <td
            key={tier.id}
            className={clsx(
              "border-l border-border px-4 py-2 align-middle",
              tier.is_current && "bg-primary/5",
            )}
          >
            {enabled ? (
              <Check
                className="h-4 w-4 text-emerald-600"
                aria-label={`${PLAN_LABEL[tier.id]} paketinde ${FEATURE_LABEL[featureKey]} açık`}
              />
            ) : (
              <X
                className="h-4 w-4 text-muted"
                aria-label={`${PLAN_LABEL[tier.id]} paketinde ${FEATURE_LABEL[featureKey]} kapalı`}
              />
            )}
          </td>
        );
      })}
    </tr>
  );
}

// Re-export `Plan` so callers can build tier-keyed lookup tables without
// re-importing from `@/types/admin`. Kept at the bottom to avoid mixing
// it with the component surface above.
export type { Plan } from "@/types/admin";