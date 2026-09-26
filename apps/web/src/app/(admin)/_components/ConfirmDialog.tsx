"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  /** Heading — keep it short, e.g. "Menüyü sil". */
  title: string;
  /** Body copy — explain the consequence. */
  description?: string;
  /** Confirmation label (default "Sil"). */
  confirmLabel?: string;
  /** Cancellation label (default "Vazgeç"). */
  cancelLabel?: string;
  /** Visual tone — danger (red) is the default for delete flows. */
  tone?: "danger" | "primary";
  /** Whether the confirm action is in flight (shows spinner). */
  loading?: boolean;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Called when the user cancels / dismisses. */
  onCancel: () => void;
}

/**
 * ConfirmDialog — minimal modal for destructive actions (delete menu,
 * delete category, delete item). Built on a `<dialog>` element so we get
 * backdrop + ESC handling for free, no extra dependencies.
 *
 * Use `loading` while the underlying fetch is in flight to prevent
 * double-submission.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Sil",
  cancelLabel = "Vazgeç",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);

  // Sync the `open` prop with the native <dialog>'s imperative API.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // ESC handler — native <dialog> calls the `cancel` event; we forward.
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
      aria-labelledby="confirm-dialog-title"
      className="rounded-xl border border-border bg-surface p-0 shadow-floating backdrop:bg-text/40"
    >
      <div className="flex w-full max-w-md flex-col gap-4 p-6">
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className={
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full " +
              (tone === "danger"
                ? "bg-accent/10 text-accent"
                : "bg-primary/10 text-primary")
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-dialog-title"
              className="font-heading text-lg font-bold text-text"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted">{description}</p>
            ) : null}
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

        <footer className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={
              "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 " +
              (tone === "danger"
                ? "bg-accent text-primary-foreground hover:bg-accent/90 focus:ring-accent"
                : "bg-primary text-primary-foreground hover:bg-primary/90 focus:ring-primary")
            }
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Lütfen bekleyin…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
