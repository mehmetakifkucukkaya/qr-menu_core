/**
 * /account/login — magic-link request form (Sprint 10B / D-025).
 *
 * Server component that mounts the client `<MagicLinkLoginForm>`.
 * Lives outside any auth-gated layout — the form is for users who
 * do NOT have a session yet.
 */

import Link from "next/link";
import { Mail } from "lucide-react";

import { MagicLinkLoginForm } from "../_components/MagicLinkLoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  searchParams: { next?: string };
}

export default function LoginPage({ searchParams }: PageProps) {
  const next = typeof searchParams?.next === "string" ? searchParams.next : "/account";

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        <div className="mx-auto flex w-full flex-col gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <header className="flex flex-col items-start gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Mail className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="font-heading text-xl font-bold text-text">
              Hesabınıza giriş yapın
            </h1>
            <p className="text-sm text-muted">
              Email adresinize tek kullanımlık bir giriş bağlantısı
              gönderiyoruz. Bağlantıya tıklayınca oturumunuz açılır.
            </p>
          </header>
          <MagicLinkLoginForm />
          <div className="flex items-center justify-between border-t border-border pt-4 text-sm">
            <Link
              href="/"
              className="font-medium text-text transition hover:text-primary"
            >
              ← Menüye dön
            </Link>
            {next !== "/account" ? (
              <span className="text-xs text-muted">Yönlendirme: {next}</span>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
