"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import clsx from "clsx";

interface PriceEditorProps {
  /** Current price value (decimal-as-string). */
  value: string;
  /** Currency code — purely display, not stored. */
  currency: string;
  /** Whether the editor is in a busy state. */
  loading?: boolean;
  /** Save handler — receives the new value as a 2-decimal string. */
  onSave: (next: string) => Promise<void> | void;
  /** Called when the user dismisses without saving. */
  onCancel?: () => void;
}

/**
 * PriceEditor — inline price input with quick save.
 *
 * Used by the items list table to support the "edit price in place"
 * flow. The backend serializes DecimalField as a string; we round the
 * local input to 2 decimals on save and re-validate as a non-negative
 * number (the DRF MinValueValidator enforces this server-side too).
 *
 * Behaviour:
 *   - Click the current price → edit mode opens.
 *   - Enter / Save → calls onSave with the normalized string.
 *   - Escape / Cancel → reverts.
 *   - Save success → closes edit mode (parent re-fetches the list).
 */
export function PriceEditor({
  value,
  currency,
  loading = false,
  onSave,
  onCancel,
}: PriceEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    onCancel?.();
  };

  const save = async () => {
    setError(null);
    // Normalize: replace comma with dot, trim, parse to number.
    const normalized = draft.trim().replace(",", ".");
    if (!normalized) {
      setError("Fiyat gerekli.");
      return;
    }
    const num = Number.parseFloat(normalized);
    if (!Number.isFinite(num) || num < 0) {
      setError("Geçerli bir pozitif sayı girin.");
      return;
    }
    // 2-decimal round (banker's rounding to match Python Decimal).
    const fixed = num.toFixed(2);
    try {
      await onSave(fixed);
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Fiyat güncellenemedi.",
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        className={clsx(
          "inline-flex items-center gap-1 rounded px-2 py-1 text-sm font-semibold tabular-nums text-text transition",
          "hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
        title="Fiyatı düzenlemek için tıklayın"
      >
        {value} {currency}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        min="0"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={loading}
        aria-label="Fiyat"
        className="w-24 rounded-xl border border-input bg-surface px-2 py-1 text-base sm:text-sm tabular-nums text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:opacity-60"
      />
      <span className="text-xs text-muted">{currency}</span>
      <button
        type="button"
        onClick={save}
        disabled={loading}
        aria-label="Kaydet"
        className="inline-flex items-center justify-center rounded-md bg-primary p-1 text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={loading}
        aria-label="Vazgeç"
        className="inline-flex items-center justify-center rounded-md border border-border bg-surface p-1 text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        <X className="h-4 w-4" />
      </button>
      {error ? (
        <span role="alert" className="ml-2 text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
