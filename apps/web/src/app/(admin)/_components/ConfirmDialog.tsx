"use client";

import { AlertTriangle, HelpCircle } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

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
 * ConfirmDialog — modal for destructive (or otherwise irreversible) actions:
 * delete menu, delete category, delete item.
 *
 * Built on `Sheet`, so it shares the app's one modal behaviour: native
 * <dialog> focus trap, Escape, tap-outside, and a bottom sheet on phones. Each
 * instance gets its own heading id — the earlier hand-rolled dialog used a
 * fixed id, which produced N duplicate ids on lists with one dialog per row.
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
  const danger = tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <Sheet
      open={open}
      // A request in flight must not be abandoned by a stray Escape / backdrop tap.
      onClose={() => {
        if (!loading) onCancel();
      }}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="lg"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="lg"
            onClick={onConfirm}
            loading={loading}
            className="flex-1"
          >
            {loading ? "Lütfen bekleyin…" : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-4 py-2">
        <span
          aria-hidden
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
            (danger ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary")
          }
        >
          <Icon className="h-5 w-5" />
        </span>
        <p className="pt-1.5 text-[0.9375rem] leading-relaxed text-muted">
          {description ?? "Bu işlemi onaylıyor musunuz?"}
        </p>
      </div>
    </Sheet>
  );
}
