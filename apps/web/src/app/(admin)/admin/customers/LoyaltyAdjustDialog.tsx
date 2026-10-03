"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  CheckCircle2,
  Loader2,
  Minus,
  Plus,
  Wallet,
  X,
} from "lucide-react";

import { adjustLoyaltyPoints, AdminApiError } from "@/lib/api-admin";

interface LoyaltyAdjustDialogProps {
  customerId: number;
  customerName: string;
  currentBalance: number;
  csrfToken: string | null;
}

/**
 * LoyaltyAdjustDialog — modal for manual point adjustment.
 *
 * Backend route: POST /api/v1/account/admin/customers/{id}/loyalty-adjust/
 * Body: { delta_points: int, note?: string }
 * Returns: { transaction, new_balance }
 *
 * The dialog is mounted but hidden until the parent triggers
 * window.dispatchEvent(new CustomEvent('loyalty-adjust:open', { detail: { id } }))
 * — see `CustomerDetailHeader` for the trigger button. We use a window
 * event so the server-rendered button stays a server component and
 * avoids dragging the dialog into a heavier client tree.
 */
export function LoyaltyAdjustDialog({
  customerId,
  customerName,
  currentBalance,
  csrfToken,
}: LoyaltyAdjustDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ newBalance: number } | null>(null);

  // Listen for the custom event from the parent trigger button.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: number }>).detail;
      if (detail && typeof detail.id === "number" && detail.id === customerId) {
        setOpen(true);
        setDelta("");
        setNote("");
        setError(null);
        setSuccess(null);
      }
    };
    window.addEventListener("loyalty-adjust:open", handler);
    return () => window.removeEventListener("loyalty-adjust:open", handler);
  }, [customerId]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, submitting]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const parsed = Number.parseInt(delta, 10);
  const validationErrors: string[] = [];
  if (delta.trim() === "" || !Number.isInteger(parsed)) {
    validationErrors.push("Puan tam sayı olmalı.");
  } else if (parsed === 0) {
    validationErrors.push("Düzeltme sıfır olamaz.");
  }
  const isValid = validationErrors.length === 0;
  const projectedBalance = Number.isInteger(parsed)
    ? currentBalance + parsed
    : currentBalance;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    if (!isValid) {
      setError(validationErrors[0]);
      return;
    }
    setSubmitting(true);
    try {
      const result = await adjustLoyaltyPoints(
        customerId,
        { delta_points: parsed, note: note.trim() || undefined },
        csrfToken,
      );
      setSuccess({ newBalance: result.new_balance });
      // Refresh the parent RSC tree so the detail page re-renders with
      // the new transaction + balance.
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Puan ayarlaması başarısız.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loyalty-adjust-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-2xl">
        <form onSubmit={submit} className="flex flex-col gap-4 p-6">
          <header className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Award className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2
                  id="loyalty-adjust-title"
                  className="font-heading text-base font-bold text-text"
                >
                  Manuel Puan Ayarla
                </h2>
                <p className="text-xs text-muted">
                  {customerName} ·{" "}
                  <span className="tabular-nums">mevcut {currentBalance}</span>{" "}
                  puan
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="rounded-md p-1 text-muted transition hover:bg-background hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
            >
              {error}
            </div>
          ) : null}
          {success ? (
            <div
              role="status"
              className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-text"
            >
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
              Yeni bakiye:{" "}
              <b className="tabular-nums text-primary">
                {success.newBalance} puan
              </b>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="loyalty-delta"
              className="text-sm font-medium text-text"
            >
              Düzeltme (puan)
            </label>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setDelta(String((parsed || 0) - 10))}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 text-text transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="-10"
              >
                <Minus className="h-4 w-4" aria-hidden />
                <span className="ml-1 text-xs">10</span>
              </button>
              <input
                id="loyalty-delta"
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                placeholder="örn. -25 veya 100"
                disabled={submitting}
                step="1"
                className="flex-1 rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setDelta(String((parsed || 0) + 10))}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 text-text transition hover:bg-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="+10"
              >
                <Plus className="h-4 w-4" aria-hidden />
                <span className="ml-1 text-xs">10</span>
              </button>
            </div>
            <p className="text-xs text-muted">
              Pozitif değer puan ekler, negatif değer puan düşer. Sıfır
              gönderilemez.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="loyalty-note"
              className="text-sm font-medium text-text"
            >
              Not (opsiyonel)
            </label>
            <textarea
              id="loyalty-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              disabled={submitting}
              placeholder="Audit kaydına yazılır. Örn: 'Şikayet telafisi'"
              className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          {isValid ? (
            <aside className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-text">
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-primary" aria-hidden />
                İşlem sonrası tahmini bakiye
              </span>
              <b className="tabular-nums text-primary">
                {projectedBalance} puan
              </b>
            </aside>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting || !isValid}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uygulanıyor…
                </>
              ) : (
                "Uygula"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
