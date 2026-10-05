import { KeyRound, LogOut } from "lucide-react";

import { PasswordChangeForm } from "./PasswordChangeForm";

interface ForcedPasswordChangeProps {
  csrfToken: string | null;
  landingHref: string;
  /** Logout form action - server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

/**
 * Rendered by the admin layout INSTEAD of the shell while the account still
 * uses a temporary password (a new team member, or after a reset). The rest of
 * the panel is not reachable until the password is changed.
 */
export function ForcedPasswordChange({
  csrfToken,
  landingHref,
  logoutAction,
}: ForcedPasswordChangeProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <KeyRound className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="font-heading text-xl font-bold text-text">Şifrenizi belirleyin</h1>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
          Hesabınız geçici bir şifreyle açıldı. Devam etmeden önce yalnızca sizin bileceğiniz yeni
          bir şifre seçin.
        </p>
        <PasswordChangeForm csrfToken={csrfToken} forced landingHref={landingHref} />
        <form action={logoutAction} className="mt-6 border-t border-border pt-4">
          <button
            type="submit"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Çıkış yap
          </button>
        </form>
      </div>
    </main>
  );
}
