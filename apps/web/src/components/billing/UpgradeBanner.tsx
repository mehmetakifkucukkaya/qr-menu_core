"use client";

/**
 * UpgradeBanner — Sprint B3b.
 *
 * Compact upgrade-prompt banner that surfaces on the public menu page
 * (and inside the checkout modal) when a tenant feature the page is
 * about to use is gated by the active plan. Two visual variants:
 *
 *   - `sticky` — full-width strip at the top of the page (default).
 *                Sits ABOVE the existing sticky header with a higher
 *                z-index so the upgrade prompt is always visible while
 *                the customer scrolls. The header is intentionally left
 *                untouched: when the banner is shown the gated features
 *                (cart icon, loyalty badge, Hesabım, Sipariş Ver) are
 *                also hidden, so the header is mostly empty behind the
 *                banner anyway.
 *   - `inline` — Card-shaped panel that fits inside another surface
 *                (e.g. the CheckoutForm modal header). Uses the
 *                Sprint 12A `<Card>` primitive + `<IconButton>` so it
 *                matches the rest of the design system.
 *
 * Visibility rule: pure function `hasFeature(settings, feature)` — when
 * the feature is already enabled for the tenant, the banner returns
 * `null` and renders nothing. Safe-default when `settings === null`
 * (fetch failed) is "feature off" → banner shows. That matches the
 * rest of the public UI which degrades to the conservative variant
 * when the tenant plan is unknown.
 *
 * Accessibility:
 *   - The banner has `role="region"` + a Turkish `aria-label` so screen
 *     reader users hear "Plan yükseltme önerisi" when focus lands on
 *     the strip.
 *   - The CTA is a real anchor (`<Link href="/admin/billing">`) so the
 *     browser handles it correctly (right-click open in new tab, etc.).
 *   - `motion-reduce:` Tailwind variants disable the hover transition
 *     for users with `prefers-reduced-motion: reduce`.
 *   - The optional dismiss button has an `aria-label` ("Kapat") so it
 *     does not rely on the visible "×" glyph.
 *
 * Tone: amber. The four plan tones (slate / blue / amber / violet) live
 * in `PLAN_TONE`; we don't paint by `targetPlan` because the message
 * is "upgrade", not "this is the OPS tier" — the upgrade target name
 * shows up in the copy as `PLAN_LABEL[targetPlan]`.
 */

import Link from "next/link";
import { Sparkles, TrendingUp, X } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { hasFeature } from "@/lib/feature-flags";
import { FEATURE_LABEL, PLAN_LABEL } from "@/types/admin";
import type {
  FeatureName,
  PlanTier,
  PublicSettings,
} from "@/types/public";

export interface UpgradeBannerProps {
  /** Which feature is being gated. Used to pick the visible label and
   *  to compute the hide rule. */
  feature: FeatureName;
  /** The plan tier that unlocks this feature. The label of this tier
   *  is shown in the banner copy ("PLAN_X planına dahil"). */
  targetPlan: PlanTier;
  /** Tenant plan settings. `null` / undefined → banner shows. */
  settings?: PublicSettings | null;
  /** Inline = mounted inside another surface (checkout modal). The
   *  default `sticky` floats at the top of the page. */
  variant?: "sticky" | "inline";
  /** Optional dismiss handler. When provided, a small "×" button is
   *  rendered on the right edge. The parent should manage the
   *  dismissed state in its own store / local state. */
  onDismiss?: () => void;
}

export function UpgradeBanner({
  feature,
  targetPlan,
  settings,
  variant = "sticky",
  onDismiss,
}: UpgradeBannerProps) {
  // Hide when the tenant already has the feature. With null/undefined
  // settings the helper returns false → banner shows. This is the
  // safe-default: when we don't know the tenant plan, we don't silently
  // unlock premium UX.
  if (hasFeature(settings ?? null, feature)) return null;

  const featureLabel = FEATURE_LABEL[feature];
  const planLabel = PLAN_LABEL[targetPlan];

  if (variant === "sticky") {
    return (
      <div
        role="region"
        aria-label="Plan yükseltme önerisi"
        className="sticky top-0 z-40 w-full border-b border-warning/30 bg-warning-soft backdrop-blur supports-[backdrop-filter]:bg-warning-soft motion-reduce:transition-none"
      >
        <div className="mx-auto flex max-w-2xl items-start gap-3 px-4 py-2.5">
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-snug text-warning">
              <span className="font-semibold">{featureLabel}</span> özelliği{" "}
              <span className="font-semibold">{planLabel}</span> planına dahil.
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-warning">
              Paketinizi yükselterek bu özelliği açabilirsiniz.
            </p>
          </div>
          <Link
            href="/admin/billing"
            prefetch={false}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-warning/90 active:bg-warning/80 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 focus:ring-offset-warning-soft motion-reduce:transition-none"
          >
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            <span>Yükselt</span>
          </Link>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Kapat"
              className="touch-target inline-flex shrink-0 items-center justify-center rounded-full p-1 text-warning transition hover:bg-warning/10 focus:outline-none focus:ring-2 focus:ring-warning motion-reduce:transition-none"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Inline variant — used inside the CheckoutForm modal.
  return (
    <Card
      variant="outline"
      className="border-warning/30 bg-warning-soft"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-semibold text-warning">
            {featureLabel} özelliği {planLabel} planına dahil.
          </p>
          <p className="mt-1 text-xs text-warning">
            Online ödeme bu pakette mevcut değil — sipariş kasada nakit
            olarak tahsil edilir.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              href="/admin/billing"
              prefetch={false}
              className="inline-flex"
            >
              <IconButton
                icon={<TrendingUp className="h-4 w-4" aria-hidden />}
                ariaLabel="Plan yükselt"
                variant="primary"
                size="md"
              >
                Yükselt
              </IconButton>
            </Link>
            {onDismiss ? (
              <IconButton
                icon={<X className="h-4 w-4" aria-hidden />}
                ariaLabel="Kapat"
                variant="ghost"
                size="md"
                onClick={onDismiss}
              />
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}