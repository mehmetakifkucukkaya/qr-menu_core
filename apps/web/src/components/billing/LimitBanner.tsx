"use client";

/**
 * LimitBanner — the "you have reached a limit" banner.
 *
 * The backend answers HTTP 402 (`billing.limit_exceeded`) when a tenant
 * runs into one of its tier caps. Before this banner existed, that
 * answer only appeared as a line of text inside the form that happened
 * to trigger it, and on the analytics page it replaced the whole
 * dashboard with a generic error. The operator had no idea what to do
 * next.
 *
 * This banner is the answer: what the limit is, how much of it is
 * used, and a "Yükselt" button that takes them to the plan page.
 *
 * It sits in the admin shell (above the page), so a limit hit anywhere
 * — adding a product, changing the languages, running out of AI
 * allowance — surfaces in the same place.
 *
 * Visual language: the same amber as `UpgradeBanner` (the two say the
 * same thing: "your plan is too small"), so the operator does not have
 * to learn a second colour.
 *
 * Accessibility:
 *   * `role="region"` + a Turkish `aria-label`;
 *   * the dismiss button has its own `aria-label` ("Kapat");
 *   * the CTA is a real link, so it behaves like every other link.
 */

import Link from "next/link";
import { TrendingUp, X } from "lucide-react";

import { limitLabel, useLimitNoticeStore } from "@/lib/stores/limit-notice";

export function LimitBanner() {
  const notice = useLimitNoticeStore((s) => s.notice);
  const dismiss = useLimitNoticeStore((s) => s.dismiss);

  if (!notice) return null;

  const label = limitLabel(notice.resource);
  const numbers =
    notice.current !== null && notice.limit !== null
      ? ` (${notice.current}/${notice.limit})`
      : "";

  return (
    <div
      role="region"
      aria-label="Plan limiti uyarısı"
      data-testid="limit-banner"
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
            <span className="font-semibold">{label}</span> limitiniz doldu
            {numbers}.
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-warning">
            Paketinizi yükselterek bu limite kaldırabilirsiniz.
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
        <button
          type="button"
          onClick={dismiss}
          aria-label="Kapat"
          className="touch-target inline-flex shrink-0 items-center justify-center rounded-full p-1 text-warning transition hover:bg-warning/10 focus:outline-none focus:ring-2 focus:ring-warning motion-reduce:transition-none"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
