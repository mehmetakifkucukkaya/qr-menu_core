"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Loader2, Sparkles, X } from "lucide-react";

import { AIAssistButton } from "./AIAssistButton";
import { describeMenuItem } from "@/lib/api-admin";
import type { AIDescribeItemResponse } from "@/types/admin";

interface DescriptionGeneratorModalProps {
  open: boolean;
  /** Item id whose description we are about to generate. */
  itemId: number;
  /** CSRF token forwarded to POST /api/v1/admin/describe/menu-item/{id}/. */
  csrfToken: string | null;
  /** Locale to generate the description in (e.g. menu.default_locale). */
  locale: string;
  /** Whether the operator has already edited the current description —
   *  when true the modal surfaces a 'Yeniden Üret (force)' badge and
   *  sends force=true on the next click (D-023 regen guard). */
  isAlreadyEdited?: boolean;
  /** Callback invoked when the operator accepts the generated text.
   *  The parent PATCHes the item's description field with this value. */
  onApply: (description: string) => void;
  /** Called when the operator dismisses. */
  onCancel: () => void;
}

/**
 * DescriptionGeneratorModal — Sprint 9B.
 *
 * UX:
 *  1. Modal opens → auto-fires `describeMenuItem(itemId, {locale})`
 *     (POST /api/v1/admin/describe/menu-item/{id}/). Server returns
 *     {description, regenerated, is_edited, provider, model, confidence}.
 *  2. Generated text lands in an editable textarea so the operator can
 *     tweak it before saving. Saves through the `onApply` callback —
 *     the parent form is responsible for PATCH /admin/menu-items/{id}/.
 *  3. "Yeniden Üret" button (force=true) re-runs the AI even if the
 *     current description was manually edited.
 *  4. Badge below the textarea shows cache hit ("Önbellekten") or
 *     fresh provider/model info.
 */
export function DescriptionGeneratorModal({
  open,
  itemId,
  csrfToken,
  locale,
  isAlreadyEdited = false,
  onApply,
  onCancel,
}: DescriptionGeneratorModalProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [result, setResult] = useState<AIDescribeItemResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const runGenerate = useCallback(
    async (force: boolean) => {
      if (!csrfToken) {
        setError("CSRF token eksik. Sayfayı yenileyin.");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await describeMenuItem(
          itemId,
          { locale: locale as never, force },
          csrfToken,
        );
        setResult(response);
        setDraft(response.description);
      } catch (err) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "AI açıklama üretimi başarısız.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [csrfToken, itemId, locale],
  );

  // Auto-run on first open — the operator sees the spinner for ~1-3s
  // and then a ready-to-edit draft. `force` defaults to false; if the
  // operator wants to overwrite an edited description they can click
  // "Yeniden Üret".
  useEffect(() => {
    if (!open || result || loading) return;
    void runGenerate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-labelledby="description-generator-title"
      className="rounded-xl border border-border bg-surface p-0 shadow-floating backdrop:bg-text/40"
    >
      <div className="flex w-full max-w-xl flex-col gap-4 p-6">
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="description-generator-title"
              className="font-heading text-lg font-bold text-text"
            >
              AI ile açıklama üret
            </h2>
            <p className="mt-1 text-sm text-muted">
              Hedef dil: <span className="font-semibold uppercase">{locale}</span>
              {isAlreadyEdited ? (
                <span className="ml-2 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  Daha önce düzenlenmiş
                </span>
              ) : null}
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

        <div className="flex flex-col gap-2">
          <label
            htmlFor="description-generator-draft"
            className="text-sm font-medium text-text"
          >
            Önerilen açıklama
          </label>
          <textarea
            id="description-generator-draft"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            disabled={loading && !draft}
            className={clsx(
              "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
              loading && !draft && "opacity-60",
            )}
            placeholder="AI önerisi burada görünecek…"
          />
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>
              {result ? (
                result.regenerated ? (
                  <>
                    Yeni üretildi ·{" "}
                    <span className="font-mono">
                      {result.provider}/{result.model}
                    </span>
                    {result.confidence ? (
                      <>
                        {" "}
                        · güven{" "}
                        <span className="font-mono">{result.confidence}</span>
                      </>
                    ) : null}
                  </>
                ) : (
                  <span className="font-semibold text-primary">
                    Önbellekten döndü — düzenleme yapılmadı
                  </span>
                )
              ) : (
                "AI ilk kez üretiyor…"
              )}
            </span>
            <AIAssistButton
              label={isAlreadyEdited ? "Yeniden Üret" : "Yeniden Dene"}
              size="sm"
              action={() => runGenerate(true)}
              testId="description-generator-regenerate"
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-accent">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={() => onApply(draft.trim())}
            disabled={loading || !draft.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Kaydet
          </button>
        </footer>
      </div>
    </dialog>
  );
}