"use client";

/**
 * LogoutButton — Sprint 10B (D-025).
 *
 * Inline-confirm client button that submits the `logoutCustomerAction`
 * server action. The action:
 *   - forwards the existing customer cookie to the backend
 *   - clears the customer cookie on the document
 *   - redirects to /account/login
 */

import { useState, useTransition } from "react";
import { LogOut } from "lucide-react";

import { logoutCustomerAction } from "../_actions/auth";

interface LogoutButtonProps {
  /** Optional label override (default "Çıkış"). */
  label?: string;
  /** Variant — "compact" for inline header, "block" for the dashboard card. */
  variant?: "compact" | "block";
}

export function LogoutButton({ label = "Çıkış", variant = "compact" }: LogoutButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      try {
        await logoutCustomerAction();
      } catch {
        // Server action triggers redirect(); throws elsewhere would be
        // network/cookie errors. The component is unmounted on success;
        // we silently swallow the rest.
      }
    });
  };

  if (variant === "block") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-label="Çıkış yap"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        {pending ? "Çıkış yapılıyor…" : confirming ? "Emin misiniz? Tekrar tıklayın" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={confirming ? "Onayla: çıkış yap" : "Çıkış yap"}
      className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60 ${
        confirming
          ? "border border-accent/60 bg-accent/5 text-accent hover:bg-accent/10"
          : "border border-border bg-surface text-text hover:bg-background"
      }`}
    >
      <LogOut className="mr-1 h-3.5 w-3.5" aria-hidden />
      {pending ? "Çıkış…" : confirming ? "Emin misiniz?" : label}
    </button>
  );
}
