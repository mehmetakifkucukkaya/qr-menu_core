"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, Loader2, Sparkles, X } from "lucide-react";

interface AIAssistButtonProps {
  /** Async action triggered when the operator clicks the button. */
  action: () => Promise<void> | void;
  /** Visible label, e.g. "AI Çevir", "Açıklama Oluştur". */
  label: string;
  /** Visual weight. `inline` matches a form field button; `primary` is
   *  the modal action bar. Defaults to `inline`. */
  variant?: "primary" | "inline";
  /** `sm` for inline form buttons; `md` for modal action bars. */
  size?: "sm" | "md";
  disabled?: boolean;
  /** Optional icon override; defaults to the Sparkles wand. */
  icon?: React.ReactNode;
  /** Accessible label override (defaults to `label`). */
  ariaLabel?: string;
  /** Title attribute override (defaults to `label`). */
  title?: string;
  /** `data-testid` hook for tests / debugging. */
  testId?: string;
  /** Disable the brief skeleton-then-spinner flash (used for sub-100ms
   *  cached translations where the spinner would feel laggy). */
  skipLoadingFlash?: boolean;
}

/**
 * AIAssistButton — shared reusable action button for AI features.
 *
 * Behaviour:
 *   - Idle       → outlined button with Sparkles icon
 *   - Loading    → spinner replaces the icon; button stays the same width
 *                  so surrounding controls don't jump. A 200ms grace
 *                  period prevents flash-of-spinner on cache hits.
 *   - Success    → brief green check (500ms) — visible cue for the
 *                  operator that the AI call landed
 *   - Error      → red outline + small error pill below the button
 *                  (auto-clears on the next click)
 *
 * Used by TranslationTabs (inline per-locale), DescriptionGeneratorModal
 * (modal action), BulkTranslateModal (action bar).
 */
export function AIAssistButton({
  action,
  label,
  variant = "inline",
  size = "sm",
  disabled,
  icon,
  ariaLabel,
  title,
  testId,
  skipLoadingFlash = false,
}: AIAssistButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (successTimer.current) clearTimeout(successTimer.current);
      if (loadingTimer.current) clearTimeout(loadingTimer.current);
    };
  }, []);

  const trigger = async () => {
    if (state === "loading") return;
    if (successTimer.current) clearTimeout(successTimer.current);
    if (loadingTimer.current) clearTimeout(loadingTimer.current);
    setErrorMsg(null);

    if (skipLoadingFlash) {
      setState("loading");
    } else {
      // 200ms grace period — keep idle UI for cache hits under 100ms.
      loadingTimer.current = setTimeout(() => {
        if (mountedRef.current) setState("loading");
      }, 200);
    }

    try {
      await action();
      if (!mountedRef.current) return;
      setState("success");
      successTimer.current = setTimeout(() => {
        if (mountedRef.current) setState("idle");
      }, 500);
    } catch (err) {
      if (!mountedRef.current) return;
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "AI isteği başarısız.";
      setErrorMsg(msg);
      setState("error");
    } finally {
      if (loadingTimer.current) {
        clearTimeout(loadingTimer.current);
        loadingTimer.current = null;
      }
    }
  };

  const isLoading = state === "loading";
  const isSuccess = state === "success";
  const isError = state === "error";

  const sizeClass =
    size === "sm"
      ? "px-2.5 py-1 text-xs"
      : "px-4 py-2 text-sm";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={trigger}
        disabled={disabled || isLoading}
        aria-label={ariaLabel ?? label}
        title={title ?? label}
        data-testid={testId}
        data-state={state}
        className={clsx(
          "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
          sizeClass,
          variant === "primary"
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
          isError &&
            "border-danger/30 bg-danger-soft text-danger hover:bg-danger/10",
          isSuccess && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {isLoading ? (
          <Loader2 className={clsx("animate-spin", iconSize)} aria-hidden />
        ) : isSuccess ? (
          <Check className={iconSize} aria-hidden />
        ) : isError ? (
          <X className={iconSize} aria-hidden />
        ) : (
          icon ?? <Sparkles className={iconSize} aria-hidden />
        )}
        <span>{label}</span>
      </button>
      {isError && errorMsg ? (
        <span
          role="alert"
          className="max-w-[20rem] text-[11px] text-danger"
        >
          {errorMsg}
        </span>
      ) : null}
    </span>
  );
}