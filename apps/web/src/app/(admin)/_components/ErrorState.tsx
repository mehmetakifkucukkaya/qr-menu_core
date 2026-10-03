"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";

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
 *
 * Uses the danger tokens (it used to borrow the olive `accent`, which read as
 * a success state) and pairs the colour with an icon and a heading.
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
      className="flex flex-col items-center rounded-2xl bg-danger-soft px-6 py-9 text-center ring-1 ring-danger/20"
    >
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-semibold text-text">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
        {message}
      </p>
      {code ? (
        <p className="mt-2 font-mono text-xs text-outline">{code}</p>
      ) : null}
      {onRetry ? (
        <Button onClick={onRetry} className="mt-5">
          Tekrar dene
        </Button>
      ) : null}
    </div>
  );
}
