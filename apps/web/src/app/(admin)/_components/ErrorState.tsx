"use client";

interface AdminErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

/**
 * AdminErrorState — inline failure UI for admin cards / sections. The
 * admin layout's error boundary catches route-level errors; this is the
 * "soft" sibling for individual sections.
 */
export function AdminErrorState({
  title = "Bir şeyler ters gitti.",
  message = "Lütfen tekrar deneyin veya sayfayı yenileyin.",
  code,
  onRetry,
}: AdminErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-accent/40 bg-accent/5 px-6 py-8 text-center"
    >
      <h2 className="font-heading text-base font-bold text-text">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted">{message}</p>
      {code ? (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          {code}
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Tekrar dene
        </button>
      ) : null}
    </div>
  );
}
