import { LogOut, ShieldAlert } from "lucide-react";

interface AccountBlockedProps {
  title: string;
  message: string;
  /** Logout form action - server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

/**
 * Rendered by the admin layout INSTEAD of the shell when the signed-in account
 * cannot use any business: the agency suspended it, or the account belongs to
 * none. The only way on is to sign out (the login page would send a signed-in
 * visitor straight back here).
 */
export function AccountBlocked({ title, message, logoutAction }: AccountBlockedProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div
        role="alert"
        className="mx-auto flex max-w-md flex-col items-center rounded-2xl bg-surface-low px-6 py-12 text-center ring-1 ring-border"
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning-soft text-warning">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="font-heading text-lg font-semibold text-text">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
        <form action={logoutAction} className="mt-6">
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
