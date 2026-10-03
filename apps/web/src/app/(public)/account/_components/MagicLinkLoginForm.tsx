"use client";

/**
 * MagicLinkLoginForm — Sprint 10B (D-025).
 *
 * Plain client form that posts the user's email to
 * `/api/v1/account/auth/request-link/`. The backend always returns 200
 * (enumeration-safe) so any "unknown email" UX is the operator's
 * responsibility, not the form's.
 *
 * States:
 *   idle      — empty form, submit button enabled.
 *   submitting — request in flight, button disabled + spinner.
 *   success    — "Mail gönderildi — linki tıklayın" + retry hint + CTA.
 *   error     — 429 / network failure inline. 401/400 are unreachable
 *               (the backend returns 200 even for invalid emails);
 *               server errors propagate.
 *
 * The parent passes an optional `csrfToken`; we forward it when set so
 * a future CSRF-on-this-endpoint change is a one-line update. Today
 * the request-link path is CSRF-exempt.
 */

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail } from "lucide-react";

import { requestMagicLink } from "@/lib/api-account";

interface MagicLinkLoginFormProps {
  csrfToken?: string;
  /** Where to redirect the user when they already have a session. */
  defaultNext?: string;
  /** Visible email field hint (e.g. demo hint). */
  hint?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; email: string }
  | { kind: "error"; message: string };

export function MagicLinkLoginForm({
  csrfToken,
  hint,
}: MagicLinkLoginFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const isDisabled =
    status.kind === "submitting" || status.kind === "success";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setStatus({ kind: "error", message: "Lütfen email adresinizi girin." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus({
        kind: "error",
        message: "Geçerli bir email adresi girin (örn. ornek@firma.com).",
      });
      return;
    }

    setStatus({ kind: "submitting" });
    try {
      await requestMagicLink(trimmed, csrfToken);
      setStatus({ kind: "success", email: trimmed });
    } catch (err) {
      let message = "Bir hata oluştu. Lütfen tekrar deneyin.";
      if (err && typeof err === "object") {
        const anyErr = err as {
          status?: number;
          message?: string;
        };
        if (anyErr.status === 429) {
          message =
            "Çok fazla deneme yaptınız. Lütfen 1 saat sonra tekrar deneyin.";
        } else if (anyErr.message) {
          message = anyErr.message;
        }
      }
      setStatus({ kind: "error", message });
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-describedby={
        status.kind === "error" ? "magic-link-error" : undefined
      }
      className="flex flex-col gap-4"
    >
      {status.kind === "success" ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft px-4 py-3 text-sm text-success"
        >
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-success"
            aria-hidden
          />
          <div className="space-y-1">
            <p className="font-semibold">Mail gönderildi</p>
            <p>
              <span className="font-medium">{status.email}</span> adresine
              giriş bağlantısı gönderdik. Lütfen gelen kutunuzu kontrol
              edin — bağlantı 15 dakika geçerlidir.
            </p>
            <p className="text-xs text-success">
              Mail gelmedi mi? Spam klasörünü kontrol edin veya birkaç
              dakika bekleyip tekrar deneyin.
            </p>
          </div>
        </div>
      ) : null}

      {status.kind === "error" ? (
        <div
          id="magic-link-error"
          role="alert"
          className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
            aria-hidden
          />
          <span>{status.message}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="magic-link-email"
          className="text-sm font-medium text-text"
        >
          Email
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        </label>
        <input
          id="magic-link-email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status.kind === "error") setStatus({ kind: "idle" });
          }}
          required
          autoComplete="email"
          inputMode="email"
          placeholder="ornek@firma.com"
          disabled={isDisabled}
          aria-invalid={status.kind === "error" ? "true" : "false"}
          className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {hint ? (
          <p className="text-[11px] text-muted">{hint}</p>
        ) : (
          <p className="text-[11px] text-muted">
            Kayıtlıysanız bu email&apos;e bir giriş bağlantısı göndeririz.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.kind === "submitting" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Gönderiliyor…
          </>
        ) : status.kind === "success" ? (
          <>
            <Mail className="h-4 w-4" aria-hidden />
            Tekrar gönder
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" aria-hidden />
            Giriş bağlantısı gönder
          </>
        )}
      </button>
    </form>
  );
}
