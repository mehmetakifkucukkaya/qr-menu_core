"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { changePassword } from "@/lib/api-admin";
import { FormField } from "./FormField";

const MIN_LENGTH = 8;

interface PasswordChangeFormProps {
  /** `qr_csrftoken` cookie value, read by the server page. */
  csrfToken: string | null;
  /**
   * The forced change after a temporary password: on success the user is sent
   * to `landingHref` (and the layout, re-run, lets them in). The voluntary
   * page just confirms.
   */
  forced?: boolean;
  landingHref: string;
}

/** Current password + new password (+ again). The server's Turkish messages are shown as they are. */
export function PasswordChangeForm({ csrfToken, forced = false, landingHref }: PasswordChangeFormProps) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (!csrfToken) {
      setError("Oturum bilgisi eksik. Sayfayı yenileyin.");
      return;
    }
    if (!current || !next) {
      setError("Mevcut ve yeni şifre zorunludur.");
      return;
    }
    if (next.length < MIN_LENGTH) {
      setError(`Yeni şifre en az ${MIN_LENGTH} karakter olmalı.`);
      return;
    }
    if (next !== again) {
      setError("Yeni şifreler birbiriyle aynı değil.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next, { csrfToken });
      setCurrent("");
      setNext("");
      setAgain("");
      if (forced) {
        router.replace(landingHref);
        router.refresh();
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şifre değiştirilemedi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {error}
        </div>
      ) : null}
      {done ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-3 py-2 text-sm font-medium text-success"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Şifreniz değiştirildi.
        </div>
      ) : null}

      <FormField
        label="Mevcut şifre"
        name="current_password"
        type="password"
        value={current}
        onChange={setCurrent}
        autoComplete="current-password"
        required
      />
      <FormField
        label="Yeni şifre"
        name="new_password"
        type="password"
        value={next}
        onChange={setNext}
        autoComplete="new-password"
        hint={`En az ${MIN_LENGTH} karakter.`}
        required
      />
      <FormField
        label="Yeni şifre (tekrar)"
        name="new_password_again"
        type="password"
        value={again}
        onChange={setAgain}
        autoComplete="new-password"
        required
      />

      <Button type="submit" size="lg" loading={submitting}>
        Şifreyi değiştir
      </Button>
    </form>
  );
}
