"use client";

import { useEffect } from "react";
import { PublicMenuError } from "@/lib/api";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Segment-level error boundary for the public menu route.
 *
 * Surfaces a human-friendly message for the structured PublicMenuError
 * (404 vs 5xx vs throttle) and offers a retry button. Falls back to a
 * generic Turkish message for anything unexpected.
 */
export default function PublicMenuErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Forward to browser console for debugging; in production this would
    // hook into analytics (Sprint 5 work).
    // eslint-disable-next-line no-console
    console.error("Public menu render failed:", error);
  }, [error]);

  const isStructured = error instanceof PublicMenuError;
  const status = isStructured ? error.status : 500;
  const code = isStructured ? error.code : "unexpected";
  const title =
    status === 0
      ? "İnternet bağlantısı yok gibi görünüyor."
      : status === 404
        ? "Menü bulunamadı."
        : status === 429
          ? "Çok fazla istek. Lütfen biraz bekleyin."
          : "Bir şeyler ters gitti.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-card">
        <h1 className="font-heading text-xl font-bold text-text">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          {error.message || "Lütfen tekrar deneyin."}
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          {code}
        </p>
        <button
          type="button"
          onClick={reset}
          className="touch-target mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Tekrar dene
        </button>
      </div>
    </main>
  );
}
