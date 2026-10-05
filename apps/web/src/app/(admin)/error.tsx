"use client";

import { AdminErrorScreen } from "./_components/AdminErrorScreen";

/**
 * Error boundary for the whole admin group - it also catches a failure of the
 * admin LAYOUT itself (for example the session check cannot reach the
 * backend), which the nested boundary below cannot: an error boundary only
 * wraps its children. Full-page, because the shell never rendered.
 */
export default function AdminGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <AdminErrorScreen error={error} reset={reset} />
    </main>
  );
}
