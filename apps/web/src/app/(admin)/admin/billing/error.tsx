"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/Container";

import { AdminApiError } from "@/lib/api-admin";

interface BillingErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Segment-level error boundary for /admin/billing (Sprint B2).
 *
 * Surfaces a human-friendly message for the structured `AdminApiError`
 * (auth vs 5xx vs network) and offers a retry button that re-runs the
 * RSC fetches. Falls back to a generic Turkish message for anything
 * unexpected.
 */
export default function BillingErrorBoundary({ error, reset }: BillingErrorProps) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Billing page render failed:", error);
  }, [error]);

  const isStructured = error instanceof AdminApiError;
  const status = isStructured ? error.status : 500;
  const code = isStructured ? error.code : "unexpected";
  const title =
    status === 0
      ? "İnternet bağlantısı yok gibi görünüyor."
      : status === 401 || status === 403
        ? "Oturum geçersiz — lütfen tekrar giriş yapın."
        : status === 404
          ? "Plan bilgisi bulunamadı."
          : "Bir şeyler ters gitti.";

  return (
    <Container size="lg" className="py-12">
      <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-card">
        <h1 className="font-heading text-xl font-bold text-text">{title}</h1>
        <p className="mt-2 text-sm text-muted">
          {error.message || "Lütfen tekrar deneyin."}
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
          {code}
          {error.digest ? ` · ${error.digest}` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Tekrar dene
        </button>
      </div>
    </Container>
  );
}