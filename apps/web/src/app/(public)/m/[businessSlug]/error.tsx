"use client";

import { useEffect } from "react";
import { Clock, RefreshCw, SearchX, TriangleAlert, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { PublicMenuError } from "@/lib/api";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Segment-level error boundary for the public menu route.
 *
 * Shows a friendly, fixed Turkish message per failure kind (offline, missing,
 * throttled, anything else) and offers a retry. The raw `error.message` is
 * never shown to the customer: for a server-side failure React replaces it
 * with an English "An error occurred in the Server Components render…" text,
 * which meant nothing to a person scanning a QR code. A server error also
 * arrives here as a plain `Error` (class identity is lost across the
 * boundary), so the structured `PublicMenuError` branch only applies to
 * client-side failures; the reference `digest` is shown instead so support can
 * find the matching server log line.
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
  const reference = error.digest ?? (isStructured ? error.code : undefined);

  const view =
    status === 0
      ? {
          icon: WifiOff,
          title: "İnternet bağlantısı yok gibi görünüyor",
          text: "Bağlantınızı kontrol edip tekrar deneyin.",
        }
      : status === 404
        ? {
            icon: SearchX,
            title: "Menü bulunamadı",
            text: "QR kodunuzdaki bağlantı geçersiz olabilir.",
          }
        : status === 429
          ? {
              icon: Clock,
              title: "Çok fazla istek",
              text: "Lütfen birkaç saniye bekleyip tekrar deneyin.",
            }
          : {
              icon: TriangleAlert,
              title: "Bir şeyler ters gitti",
              text: "Menü şu anda yüklenemedi. Lütfen tekrar deneyin.",
            };
  const Icon = view.icon;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center shadow-lg ring-1 ring-border/60">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-secondary-soft text-secondary">
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-text">
          {view.title}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          {view.text}
        </p>
        {reference ? (
          <p className="mt-3 font-mono text-xs text-outline">
            Referans: {reference}
          </p>
        ) : null}
        <Button
          size="lg"
          fullWidth
          onClick={reset}
          className="mt-6"
          leadingIcon={<RefreshCw className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
        >
          Tekrar dene
        </Button>
      </div>
    </main>
  );
}
