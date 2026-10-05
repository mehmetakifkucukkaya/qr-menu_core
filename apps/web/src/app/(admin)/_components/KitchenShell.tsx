import type { ReactNode } from "react";
import { LogOut } from "lucide-react";

import { KitchenClock } from "./KitchenClock";

export interface KitchenShellProps {
  businessName: string;
  /** Logout form action: a server-issued POST. */
  logoutAction: (formData: FormData) => void;
  children: ReactNode;
}

/**
 * The frame a kitchen user's tablet gets instead of the admin sidebar
 * (SPEC_PILOT_READINESS 5.6): the business, the time and a way out, in the
 * kitchen palette, with no menu to wander off into. Each tablet signs in with
 * its own account, so the audit trail names who tapped what.
 */
export function KitchenShell({ businessName, logoutAction, children }: KitchenShellProps) {
  return (
    <div className="kitchen-dark flex min-h-screen flex-col bg-background text-text">
      <header className="flex items-center justify-between gap-4 border-b-2 border-border px-4 py-3 sm:px-6">
        <p className="min-w-0 truncate text-2xl font-bold">{businessName}</p>
        <div className="flex shrink-0 items-center gap-5">
          <KitchenClock />
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-input px-4 text-lg font-semibold text-text transition active:scale-[0.98]"
            >
              <LogOut className="h-5 w-5" aria-hidden />
              Çıkış yap
            </button>
          </form>
        </div>
      </header>
      <main id="main-content" className="flex-1 p-3 sm:p-4">
        {children}
      </main>
    </div>
  );
}
