"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Loader2, X } from "lucide-react";

import type { AdminLocaleCode } from "@/types/admin";

interface PdfConfirmDialogProps {
  open: boolean;
  /** AI provider + model — shown in the dialog subtitle for context. */
  aiSummary?: string;
  /** Item count — surfaced in the body copy. */
  itemCount?: number;
  /** Confidence avg — surfaced in the body copy when available. */
  confidenceAvg?: number | null;
  /** Whether the underlying fetch is in flight. */
  loading: boolean;
  /** Called with the validated payload on confirm. */
  onConfirm: (payload: {
    menu_name: string;
    default_locale: AdminLocaleCode;
    is_active: boolean;
  }) => void;
  /** Called on cancel / dismiss. */
  onCancel: () => void;
  /** Optional server-side error to surface inside the modal. */
  error?: string | null;
}

/**
 * PdfConfirmDialog — Sprint 7B.
 *
 * Confirmation modal the operator sees after reviewing the parsed PDF
 * preview. Lets them:
 *   - Name the new menu (`menu_name`, required).
 *   - Pick the default locale (`tr` / `en`).
 *   - Toggle whether the menu should be active immediately.
 *
 * We render a native `<dialog>` so ESC + backdrop click handling come
 * for free (mirrors the reusable `ConfirmDialog` pattern from Sprint
 * 4B). The body shows a small summary (item count + confidence avg +
 * AI provider) so the operator knows what they're confirming.
 */
export function PdfConfirmDialog({
  open,
  aiSummary,
  itemCount,
  confidenceAvg,
  loading,
  onConfirm,
  onCancel,
  error,
}: PdfConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const inputId = useId();
  const [menuName, setMenuName] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<AdminLocaleCode>("tr");
  const [isActive, setIsActive] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset form whenever the modal opens.
  useEffect(() => {
    if (open) {
      setMenuName("");
      setDefaultLocale("tr");
      setIsActive(true);
      setValidationError(null);
    }
  }, [open]);

  // Sync the `open` prop with the native dialog's imperative API.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  // Forward ESC / backdrop cancel to the parent.
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

  const handleConfirm = () => {
    const trimmed = menuName.trim();
    if (trimmed === "") {
      setValidationError("Menü adı zorunludur.");
      return;
    }
    if (trimmed.length > 120) {
      setValidationError("Menü adı en fazla 120 karakter olabilir.");
      return;
    }
    onConfirm({
      menu_name: trimmed,
      default_locale: defaultLocale,
      is_active: isActive,
    });
  };

  const confidenceLabel =
    confidenceAvg !== null && confidenceAvg !== undefined
      ? `${(confidenceAvg * 100).toFixed(0)}%`
      : "—";

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-labelledby="pdf-confirm-dialog-title"
      className="rounded-xl border border-border bg-surface p-0 shadow-floating backdrop:bg-text/40"
    >
      <div className="flex w-full max-w-md flex-col gap-4 p-6">
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="pdf-confirm-dialog-title"
              className="font-heading text-lg font-bold text-text"
            >
              Menüyü onayla ve kaydet
            </h2>
            <p className="mt-1 text-sm text-muted">
              AI&apos;ın çıkardığı içerik yeni bir menü olarak canlıya alınır. Onay
              atomiktir — hata olursa hiçbir şey kaydedilmez.
            </p>
            {aiSummary ? (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted">
                {aiSummary} · {itemCount ?? 0} öğe · güven {confidenceLabel}
              </p>
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={inputId}
              className="text-sm font-medium text-text"
            >
              Menü adı
              <span aria-hidden className="ml-0.5 text-danger">
                *
              </span>
            </label>
            <input
              id={inputId}
              type="text"
              value={menuName}
              onChange={(e) => {
                setMenuName(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="Ör. Modern Cafe Eylül 2026"
              autoFocus
              required
              maxLength={120}
              className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            />
            <p className="text-xs text-muted">
              Slug otomatik üretilir; /admin/menus üzerinden sonradan
              değiştirebilirsiniz.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text">
              Varsayılan dil
            </legend>
            <div className="flex gap-2">
              {(["tr", "en"] as AdminLocaleCode[]).map((code) => (
                <label
                  key={code}
                  className={
                    "flex flex-1 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition " +
                    (defaultLocale === code
                      ? "border-primary bg-primary/10 text-text"
                      : "border-border bg-surface text-muted hover:bg-background")
                  }
                >
                  <input
                    type="radio"
                    name="default_locale"
                    value={code}
                    checked={defaultLocale === code}
                    onChange={() => setDefaultLocale(code)}
                    className="h-3 w-3 accent-primary"
                  />
                  <span className="font-medium uppercase">
                    {code === "tr" ? "Türkçe" : "English"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span>Hemen yayına al (public menüde görünsün)</span>
          </label>

          {(validationError || error) ? (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              {validationError ?? error}
            </p>
          ) : null}

          <footer className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor…
                </>
              ) : (
                "Onayla ve Kaydet"
              )}
            </button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}