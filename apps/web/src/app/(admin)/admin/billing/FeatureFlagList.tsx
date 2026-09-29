"use client";

import clsx from "clsx";
import {
  Award,
  BarChart3,
  CreditCard,
  FileText,
  Languages,
  Receipt,
  ShoppingCart,
  UserCircle,
  type LucideIcon,
} from "lucide-react";

import type { FeatureKey } from "@/types/admin";
import { FEATURE_DESCRIPTION, FEATURE_LABEL, FEATURE_KEYS } from "@/types/admin";

interface FeatureFlagListProps {
  /** Current feature flags from `PlanSettings.features`. */
  features: Partial<Record<FeatureKey, boolean>>;
  /** When true, render inline edit toggles next to each row.
   *  When false, render read-only badges. */
  editable?: boolean;
  /** Pending toggle state from the parent form — used so the toggles
   *  reflect dirty changes immediately without waiting for save. */
  pendingOverrides?: Partial<Record<FeatureKey, boolean>>;
  /** Called when the user flips a toggle in editable mode. */
  onToggle?: (key: FeatureKey, value: boolean) => void;
}

/**
 * Lucide icon per feature flag. Kept local to the component so we don't
 * litter the types file with icon imports.
 */
const FEATURE_ICON: Record<FeatureKey, LucideIcon> = {
  cart_enabled: ShoppingCart,
  orders_enabled: Receipt,
  loyalty_enabled: Award,
  customer_accounts_enabled: UserCircle,
  payments_enabled: CreditCard,
  ai_pdf_import_enabled: FileText,
  ai_translate_enabled: Languages,
  advanced_analytics_enabled: BarChart3,
};

/**
 * FeatureFlagList — Sprint B2.
 *
 * Renders one row per `FeatureKey`, in the canonical
 * `FEATURE_KEYS` display order so operators always see the same list.
 *
 * Two modes:
 *  - Read-only (`editable = false`) — pill badge + tooltip "Plan OPS dahil"
 *    for on, muted "Kapalı" pill for off. Used inside the read-only
 *    `<PlanCard>`-style summary on the billing page header.
 *  - Editable (`editable = true`) — toggle switch; the parent form owns
 *    the truth via `features` + `pendingOverrides` so the optimistic
 *    state shows immediately on click.
 */
export function FeatureFlagList({
  features,
  editable = false,
  pendingOverrides,
  onToggle,
}: FeatureFlagListProps) {
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
      {FEATURE_KEYS.map((key) => (
        <FeatureFlagRow
          key={key}
          featureKey={key}
          baseValue={features[key] === true}
          pendingValue={
            pendingOverrides && key in pendingOverrides
              ? pendingOverrides[key] === true
              : undefined
          }
          editable={editable}
          onToggle={onToggle}
        />
      ))}
    </ul>
  );
}

interface FeatureFlagRowProps {
  featureKey: FeatureKey;
  baseValue: boolean;
  /** When set, the toggle should display this value (dirty override). */
  pendingValue?: boolean;
  editable: boolean;
  onToggle?: (key: FeatureKey, value: boolean) => void;
}

function FeatureFlagRow({
  featureKey,
  baseValue,
  pendingValue,
  editable,
  onToggle,
}: FeatureFlagRowProps) {
  const Icon = FEATURE_ICON[featureKey];
  const hasOverride = pendingValue !== undefined;
  const displayValue = hasOverride ? (pendingValue as boolean) : baseValue;

  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={clsx(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            displayValue ? "bg-primary/10 text-primary" : "bg-muted/20 text-muted",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-text">{FEATURE_LABEL[featureKey]}</p>
          <p className="mt-0.5 text-xs text-muted">
            {FEATURE_DESCRIPTION[featureKey]}
          </p>
        </div>
      </div>

      {editable ? (
        <FeatureToggle
          checked={displayValue}
          ariaLabel={`${FEATURE_LABEL[featureKey]} özelliğini ${displayValue ? "kapat" : "aç"}`}
          onChange={(next) => onToggle?.(featureKey, next)}
        />
      ) : (
        <FeatureBadge enabled={displayValue} />
      )}
    </li>
  );
}

interface FeatureBadgeProps {
  enabled: boolean;
}

function FeatureBadge({ enabled }: FeatureBadgeProps) {
  return enabled ? (
    <span
      title="Plan OPS dahil"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary"
    >
      Açık
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
      Kapalı
    </span>
  );
}

interface FeatureToggleProps {
  checked: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
}

/**
 * Minimal accessible toggle — uses a real <button> + aria-pressed so we
 * avoid the native checkbox styling dance. Kept local to the feature
 * flag list; if other pages need a toggle, promote to `components/ui/`.
 */
function FeatureToggle({ checked, ariaLabel, onChange }: FeatureToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        checked ? "bg-primary" : "bg-muted/40",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "inline-block h-5 w-5 transform rounded-full bg-surface shadow-sm transition",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}