import { Container } from "@/components/ui/Container";

/**
 * /admin/billing loading skeleton (Sprint B2).
 *
 * Mirrors the page layout so the visual handoff on hydration is stable
 * (no jump). Four sections — header chip, plan card + form, 5 usage
 * bars, comparison table — each get a single-block skeleton.
 */
export default function BillingLoading() {
  return (
    <Container size="lg" className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-end justify-between">
        <div className="flex items-end gap-3">
          <div className="h-10 w-10 animate-pulse rounded-lg bg-muted/30" />
          <div className="flex flex-col gap-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted/30" />
            <div className="h-6 w-48 animate-pulse rounded bg-muted/40" />
            <div className="h-3 w-72 animate-pulse rounded bg-muted/20" />
          </div>
        </div>
        <div className="h-7 w-32 animate-pulse rounded-full bg-muted/30" />
      </div>

      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rounded-2xl border border-border bg-surface p-5 shadow-sm"
        >
          <div className="mb-4 flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-muted/30" />
              <div className="flex flex-col gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted/40" />
                <div className="h-3 w-64 animate-pulse rounded bg-muted/20" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {[0, 1, 2, 3].map((j) => (
              <div
                key={j}
                className="h-2 w-full animate-pulse rounded-full bg-muted/20"
              />
            ))}
          </div>
        </div>
      ))}
    </Container>
  );
}