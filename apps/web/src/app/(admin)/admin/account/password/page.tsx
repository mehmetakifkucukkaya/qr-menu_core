import { cookies } from "next/headers";
import { KeyRound } from "lucide-react";

import { PasswordChangeForm } from "@/app/(admin)/_components/PasswordChangeForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /admin/account/password - every role changes their own password here
 * (owners reset team members' passwords on the Ekip page instead).
 */
export default function AccountPasswordPage() {
  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <header className="flex items-end gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Hesap</p>
          <h1 className="font-heading text-2xl font-bold text-text">Şifre değiştir</h1>
        </div>
      </header>
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <PasswordChangeForm csrfToken={csrfToken} landingHref="/admin" />
      </div>
    </div>
  );
}
