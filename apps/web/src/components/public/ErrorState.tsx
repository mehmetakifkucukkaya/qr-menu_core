"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/Button";

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
      className="flex flex-col items-center rounded-3xl bg-surface p-7 text-center shadow-card ring-1 ring-border/60"
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary-soft text-secondary">
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-semibold text-text">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
      {code ? (
        <p className="mt-2 font-mono text-xs text-outline">{code}</p>
      ) : null}
      {onRetry ? (
        <Button
          onClick={onRetry}
          className="mt-5"
          leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
        >
          Tekrar dene
        </Button>
      ) : null}
    </div>
  );
}
