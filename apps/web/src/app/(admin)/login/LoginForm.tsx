"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/Button";
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
      className="flex flex-col gap-5"
      noValidate
      aria-describedby={state?.error ? "login-error" : undefined}
    >
      <input type="hidden" name="next" value={nextPath} />

      {state?.error ? (
        <div
          id="login-error"
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
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
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-low px-4 py-3 text-xs text-muted">
          <p className="font-semibold text-text">Demo hesabı</p>
          <p className="mt-1 break-all font-mono">
            {demoHint.email} · {demoHint.password}
          </p>
          <p className="mt-1">
            Sadece local geliştirmede geçerlidir; üretimde kullanılmaz.
          </p>
        </div>
      ) : null}

      <p className="text-center text-sm text-muted">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Anasayfaya dön
        </Link>
      </p>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {pending ? "Giriş yapılıyor…" : "Giriş yap"}
    </Button>
  );
}
