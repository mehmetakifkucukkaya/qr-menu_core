"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, Loader2 } from "lucide-react";

import { FormField } from "../_components/FormField";
import { loginAction, type LoginActionResult } from "../_actions/auth";

interface LoginFormProps {
  /** Where to send the user after a successful login. Defaults to /admin/dashboard. */
  nextPath: string;
  /** Helper copy shown beneath the form (demo credentials hint). */
  demoHint?: { email: string; password: string };
}

/**
 * LoginForm — controlled client component that calls the loginAction
 * server action. Uses React 18's `useFormState` (react-dom) so we can
 * render inline errors without a full route reload.
 */
export function LoginForm({ nextPath, demoHint }: LoginFormProps) {
  const initialState: LoginActionResult | undefined = undefined;
  const [state, formAction] = useFormState(loginAction, initialState);

  const [email, setEmail] = useState<string>(state?.email ?? "");
  const [password, setPassword] = useState<string>("");

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      noValidate
      aria-describedby={state?.error ? "login-error" : undefined}
    >
      <input type="hidden" name="next" value={nextPath} />

      {state?.error ? (
        <div
          id="login-error"
          role="alert"
          className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-text"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <FormField
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="ornek@firma.com"
        required
      />

      <FormField
        label="Şifre"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
      />

      <SubmitButton />

      {demoHint ? (
        <div className="mt-2 rounded-md border border-dashed border-border bg-background/50 px-3 py-2 text-xs text-muted">
          <p className="font-semibold text-text">Demo hesabı</p>
          <p className="mt-1 font-mono break-all">
            {demoHint.email} · {demoHint.password}
          </p>
          <p className="mt-1">
            Sadece local geliştirmede geçerlidir; üretimde kullanılmaz.
          </p>
        </div>
      ) : null}

      <p className="text-center text-xs text-muted">
        <Link href="/" className="hover:text-primary">
          ← Anasayfaya dön
        </Link>
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Giriş yapılıyor…
        </>
      ) : (
        "Giriş yap"
      )}
    </button>
  );
}
