"use client";

/**
 * TrialBanner — Sprint C3b (D-030 follow-up).
 *
 * Compact countdown banner that surfaces on the admin shell (and the
 * public menu header — when the page opts in) while a tenant is in the
 * 14-day OPS trial window opened by the C3b signup hook.
 *
 * Visibility rule: pure function `shouldRender(status, settings)` —
 *   * `status === null` (fetch failed / no tenant) → render nothing.
 *   * `in_trial === false` → render nothing.
 *   * otherwise → render the banner with the countdown.
 *
 * The banner receives `status: TrialStatus | null` so the layout can
 * pre-fetch server-side and pass `null` on a 403 / network error — the
 * banner silently hides rather than throwing.
 *
 * Accessibility:
 *   * `role="region"` + Turkish `aria-label` so screen readers hear
 *     "Deneme süresi bilgilendirmesi".
 *   * The countdown number is wrapped in a `<span>` with `aria-live`
 *     disabled (it only changes once a day; we don't want to spam the
 *     assistive tech queue).
 *   * `motion-reduce:` Tailwind variants disable the hover transition
 *     for users with `prefers-reduced-motion: reduce`.
 *
 * Tone: amber (matches the trial = "almost-premium" cue; also keeps
 * parity with `UpgradeBanner` so the visual language is consistent
 * across the admin shell).
 */

import Link from "next/link";
import { Sparkles, TrendingUp, X } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/IconButton";
import { PLAN_LABEL } from "@/types/admin";
import type { Plan } from "@/types/admin";
import type { PublicSettings } from "@/types/public";

import type { TrialStatus } from "@/lib/api-onboarding";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TrialBannerProps {
  /** Trial status payload. `null` → banner renders nothing (fetch failed). */
  status: TrialStatus | null;
  /**
   * Tenant public settings — used to derive the "what plan will you fall
   * back to?" label. Optional: when omitted, the banner falls back to
   * `BASIC` for the trailing copy.
   */
  settings?: PublicSettings | null;
  /**
   * "sticky" — full-width strip mounted at the top of the admin shell
   *   (or public menu header). Default.
   * "inline" — Card-shaped panel that fits inside another surface
   *   (e.g. the public menu hero when an operator previews their own
   *   menu during trial).
   */
  variant?: "sticky" | "inline";
  /** Optional dismiss handler — see UpgradeBanner for the same pattern. */
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Hidden test seam — re-exported for the unit tests in `TrialBanner.test.tsx`. */
export function shouldRender(status: TrialStatus | null | undefined): boolean {
  if (!status) return false;
  return status.in_trial === true;
}

/** Compute the trailing-plan label ("…BASIC'e düşürülecek"). */
function trailingPlanLabel(settings: PublicSettings | null | undefined): string {
  const plan: Plan = (settings?.active_plan ?? "basic") as Plan;
  return PLAN_LABEL[plan] ?? PLAN_LABEL.basic;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrialBanner({
  status,
  settings,
  variant = "sticky",
  onDismiss,
}: TrialBannerProps) {
  // Hide on every non-trial branch — `null` (fetch failed) and explicit
  // `in_trial: false` both hide. Centralized so tests can target the
  // single rule.
  if (!shouldRender(status)) return null;

  const days = status?.days_remaining ?? 0;
  // "14 gün kaldı" / "1 gün kaldı" / "Son gün!". Singular/plural kept
  // explicit so the banner copy is unambiguous at the boundary.
  const headline =
    days <= 0
      ? "Deneme süreniz bugün doluyor!"
      : days === 1
        ? "Deneme sürenizin son günü!"
        : `🎉 14 günlük ücretsiz Pro denemeniz başladı`;

  const countdown =
    days <= 0 ? "Son gün" : `${days} gün kaldı`;

  const fallbackPlan = trailingPlanLabel(settings);

  if (variant === "sticky") {
    return (
      <div
        role="region"
        aria-label="Deneme süresi bilgilendirmesi"
        data-testid="trial-banner-sticky"
        className="w-full border-b border-warning/30 bg-warning-soft backdrop-blur supports-[backdrop-filter]:bg-warning-soft motion-reduce:transition-none"
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
              {headline}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-warning">
              <span data-testid="trial-days-remaining" className="font-semibold">
                {countdown}
              </span>{" "}
              — deneme bitince otomatik olarak {fallbackPlan} planına
              düşürüleceksiniz.
            </p>
          </div>
          <Link
            href="/admin/billing"
            prefetch={false}
            data-testid="trial-banner-cta"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-warning/90 active:bg-warning/80 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 focus:ring-offset-warning-soft motion-reduce:transition-none"
          >
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            <span>Plan &amp; Limitler</span>
          </Link>
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Kapat"
              data-testid="trial-banner-dismiss"
              className="touch-target inline-flex shrink-0 items-center justify-center rounded-full p-1 text-warning transition hover:bg-warning/10 focus:outline-none focus:ring-2 focus:ring-warning motion-reduce:transition-none"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // Inline variant — used inside another surface (e.g. the public menu
  // hero when the operator previews their own menu during trial).
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
          <p
            data-testid="trial-banner-inline-headline"
            className="font-heading text-sm font-semibold text-warning"
          >
            {headline}
          </p>
          <p className="mt-1 text-xs text-warning">
            <span data-testid="trial-days-remaining" className="font-semibold">
              {countdown}
            </span>{" "}
            — deneme bitince {fallbackPlan} planına düşürüleceksiniz.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link href="/admin/billing" prefetch={false} className="inline-flex">
              <IconButton
                icon={<TrendingUp className="h-4 w-4" aria-hidden />}
                ariaLabel="Plan ve limitler sayfasına git"
                variant="primary"
                size="md"
              >
                Plan &amp; Limitler
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
