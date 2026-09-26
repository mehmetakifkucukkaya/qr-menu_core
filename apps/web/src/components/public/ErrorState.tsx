"use client";

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

/**
 * ErrorState — reusable error UI. The route segment already has its
 * own `error.tsx` boundary; this is the inline counterpart for partial
 * failures (e.g. a network hiccup when prefetching the next page).
 */
export function ErrorState({
  title = "Bir şeyler ters gitti.",
  message = "Lütfen tekrar deneyin.",
  code,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-6 text-center shadow-card"
    >
      <h2 className="font-heading text-base font-bold text-text">{title}</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {code ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          {code}
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="touch-target mt-4 inline-flex items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Tekrar dene
        </button>
      ) : null}
    </div>
  );
}