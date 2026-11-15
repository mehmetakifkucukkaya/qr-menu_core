"use client";

/**
 * UpgradeNotice — the one banner that says "your plan is the problem".
 *
 * Two different answers from the backend mean the same thing to the
 * operator: "your plan is too small" (402, `billing.limit_exceeded` — the
 * tenant ran into a cap) and "this module is not in your plan" (403,
 * `billing.feature_disabled` — the tenant asked for something the plan does
 * not carry).
 *
 * Before this existed the first one had a banner (`LimitBanner`) and the
 * second one had nothing: the 403 was visible only as a line of text inside
 * whichever form triggered it, or — on the kitchen screen — as a "connection
 * lost" strip that sent the cook to the wrong problem entirely.
 *
 * One banner, both answers, in Turkish, with the same "Yükselt" call to
 * action the plan page already uses. It sits in the admin shell (above the
 * page), so a plan problem surfaces in the same place wherever it happened.
 *
 * The wording comes from the server: the limit notice carries the resource
 * and its numbers, the feature notice carries the Turkish sentence and the
 * flag's Turkish label. The banner never invents a name for a flag, so the
 * two sides cannot drift apart.
 *
 * Accessibility:
 *   * `role="region"` + a Turkish `aria-label`;
 *   * the dismiss button has its own `aria-label` ("Kapat");
 *   * the CTA is a real link, so it behaves like every other link.
 */

import Link from "next/link";
import { TrendingUp, X } from "lucide-react";

import { useFeatureNoticeStore } from "@/lib/stores/feature-notice";
import { limitLabel, useLimitNoticeStore } from "@/lib/stores/limit-notice";

export function UpgradeNotice() {
  const limit = useLimitNoticeStore((s) => s.notice);
  const dismissLimit = useLimitNoticeStore((s) => s.dismiss);
  const feature = useFeatureNoticeStore((s) => s.notice);
  const dismissFeature = useFeatureNoticeStore((s) => s.dismiss);

  // The limit comes first: a tenant that hit a cap is more likely to need
  // to act than one that asked for a module it does not have.
  const kind = limit ? "limit" : feature ? "feature" : null;
  if (kind === null || (!limit && !feature)) return null;

  const headline =
    kind === "limit" && limit
      ? `${limitLabel(limit.resource)} limitiniz doldu${
          limit.current !== null && limit.limit !== null
            ? ` (${limit.current}/${limit.limit})`
            : ""
        }.`
      : feature?.message ||
        `${feature?.featureLabel || "Bu özellik"} özelliği planınızda kapalı.`;

  const subline =
    kind === "limit"
      ? "Paketinizi yükselterek bu limite kaldırabilirsiniz."
      : "Paketinizi yükselterek bu özelliği açabilirsiniz.";

  return (
    <div
      role="region"
      aria-label="Plan yükseltme bildirimi"
      data-testid="upgrade-notice"
      className="sticky top-0 z-40 w-full border-b border-warning/30 bg-warning-soft backdrop-blur supports-[backdrop-filter]:bg-warning-soft motion-reduce:transition-none"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2.5">
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"
        >
          <TrendingUp className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug text-warning">
            <span className="font-semibold">{headline}</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-warning">{subline}</p>
        </div>
        <Link
          href="/admin/billing"
          prefetch={false}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-warning/90 active:bg-warning/80 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 focus:ring-offset-warning-soft motion-reduce:transition-none"
        >
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          <span>Yükselt</span>
        </Link>
        <button
          type="button"
          onClick={kind === "limit" ? dismissLimit : dismissFeature}
          aria-label="Kapat"
          className="touch-target inline-flex shrink-0 items-center justify-center rounded-full p-1 text-warning transition hover:bg-warning/10 focus:outline-none focus:ring-2 focus:ring-warning motion-reduce:transition-none"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
