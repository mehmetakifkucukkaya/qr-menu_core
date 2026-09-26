export default function Loading() {
  return (
    <main className="min-h-screen bg-background" aria-busy="true">
      {/* Hero skeleton */}
      <div className="w-full">
        <div className="h-44 w-full animate-pulse bg-muted/30 sm:h-56" />
        <div className="mx-auto -mt-12 flex flex-col items-center px-4 pb-6">
          <div className="h-24 w-24 animate-pulse rounded-full bg-muted/40 ring-4 ring-surface" />
          <div className="mt-3 h-6 w-48 animate-pulse rounded bg-muted/40" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted/30" />
        </div>
      </div>

      {/* Category skeletons */}
      <div className="mx-auto mt-6 max-w-2xl space-y-8 px-4">
        {[0, 1, 2].map((i) => (
          <section key={i} aria-hidden>
            <div className="mb-3 h-5 w-40 animate-pulse rounded bg-muted/40" />
            <ul className="space-y-3">
              {[0, 1, 2].map((j) => (
                <li
                  key={j}
                  className="flex gap-3 rounded-lg border border-border bg-surface p-3 sm:gap-4 sm:p-4"
                >
                  <div className="h-20 w-20 animate-pulse rounded-md bg-muted/30 sm:h-24 sm:w-24" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted/30" />
                    <div className="h-3 w-full animate-pulse rounded bg-muted/20" />
                    <div className="mt-auto h-4 w-20 animate-pulse rounded bg-muted/30" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
