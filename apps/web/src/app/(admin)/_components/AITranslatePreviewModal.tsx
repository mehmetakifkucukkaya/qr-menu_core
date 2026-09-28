"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";

import type { AITranslateTextResponse } from "@/types/admin";

interface AITranslatePreviewModalProps {
  open: boolean;
  /** Display name of the source locale (e.g. "Türkçe", "TR"). */
  sourceLocaleLabel: string;
  /** Display name of the target locale (e.g. "English", "EN"). */
  targetLocaleLabel: string;
  /** Original TR text the AI was asked to translate. */
  sourceText: string;
  /** AI response payload, when `loading` is false. */
  result: AITranslateTextResponse | null;
  /** Whether the request is in flight. */
  loading: boolean;
  /** Optional error message to surface (overrides the result display). */
  errorMessage?: string | null;
  /** Called when the operator accepts the translation. */
  onApply: () => void;
  /** Called when the operator dismisses. */
  onCancel: () => void;
}

/**
 * AITranslatePreviewModal — confirm-then-apply dialog for inline AI
 * translations. Renders the source text side-by-side with the AI's
 * proposed translation so the operator can eyeball the result before
 * it overwrites their draft. Cached results show a green "Önbellekten"
 * badge; fresh calls show the provider/model name.
 *
 * Built on a native `<dialog>` so ESC + backdrop click are free, matching
 * the existing `ConfirmDialog` UX in the codebase.
 */
export function AITranslatePreviewModal({
  open,
  sourceLocaleLabel,
  targetLocaleLabel,
  sourceText,
  result,
  loading,
  errorMessage,
  onApply,
  onCancel,
}: AITranslatePreviewModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      e.preventDefault();
      onCancel();
    };
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-labelledby="ai-translate-preview-title"
      className="rounded-xl border border-border bg-surface p-0 shadow-floating backdrop:bg-text/40"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 p-6">
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="ai-translate-preview-title"
              className="font-heading text-lg font-bold text-text"
            >
              AI çeviri önizleme
            </h2>
            <p className="mt-1 text-sm text-muted">
              {sourceLocaleLabel} <ArrowRight className="inline h-3 w-3 align-middle" /> {targetLocaleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Kapat"
            className="rounded-md p-1 text-muted transition hover:bg-background hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Kaynak
            </span>
            <p className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text">
              {sourceText || <em className="text-muted">(boş)</em>}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              AI önerisi
            </span>
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-text">
              {loading ? (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  AI çeviriyor…
                </span>
              ) : errorMessage ? (
                <span className="text-accent">{errorMessage}</span>
              ) : result ? (
                <span>{result.translated}</span>
              ) : (
                <em className="text-muted">—</em>
              )}
            </div>
            {result && !loading ? (
              <p className="mt-1 text-[11px] text-muted">
                {result.cached ? (
                  <span className="font-semibold text-primary">Önbellekten</span>
                ) : (
                  <span>Kaynak: {result.provider} ({result.model})</span>
                )}
                {result.confidence ? (
                  <span className="ml-2">
                    güven: <span className="font-mono">{result.confidence}</span>
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={loading || Boolean(errorMessage) || !result}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Uygula
          </button>
        </footer>
      </div>
    </dialog>
  );
}