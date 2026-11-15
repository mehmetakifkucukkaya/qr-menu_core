import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * PlanBlockedNotice — the kitchen screen's answer to a 403 that says "your
 * plan does not include this module" (`billing.feature_disabled`).
 *
 * Without it the kitchen screen would say "Bağlantı yok" (the board polls by
 * itself and that is what a failed poll looks like) or "oturum bitti" (the
 * screen already treats a 403 as an ended session). Both send the cook to
 * the wrong problem: the tablet is fine, the account is fine, the plan is
 * what changed.
 *
 * The copy is the one the agency uses for the module ("Sipariş + mutfak"),
 * and the CTA points at the plan page — the tenant can raise its own plan,
 * or talk to the agency that opened it.
 */
export function PlanBlockedNotice({ message }: { message?: string }) {
  return (
    <div
      role="alert"
      data-testid="plan-blocked-notice"
      className="flex flex-col items-center gap-4 rounded-3xl border-2 border-warning/40 bg-warning-soft px-6 py-12 text-center"
    >
      <span
        aria-hidden
        className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/15 text-warning"
      >
        <Lock className="h-6 w-6" />
      </span>
      <h1 className="font-heading text-2xl font-bold text-text">
        Mutfak ekranı planınızda kapalı
      </h1>
      <p className="max-w-md text-base leading-relaxed text-muted">
        {message ??
          "'Sipariş + mutfak' özelliği planınızda kapalı. Bu ekranı kullanmak için paketinizi yükseltin veya ajansınızla görüşün."}
      </p>
      <Link
        href="/admin/billing"
        prefetch={false}
        className="inline-flex items-center gap-2 rounded-full bg-warning px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-warning/90 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2 motion-reduce:transition-none"
      >
        Planı yükselt
      </Link>
    </div>
  );
}
