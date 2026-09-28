/**
 * /account/verify — magic link landing page (Sprint 10B / D-025).
 *
 * The user comes here from the email link. The token lives in the URL
 * as `?token=...`. We hand it to `verifyMagicLinkAction` which calls
 * the backend, sets the `_auth_customer_id` cookie on the response,
 * and redirects to /account.
 *
 * Errors (expired / used / unknown token) render inline with a
 * "resend" CTA pointing to /account/login.
 */

import Link from "next/link";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";

import { verifyMagicLinkAction } from "../_actions/auth";

interface PageProps {
  searchParams: { token?: string };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function VerifyPage({ searchParams }: PageProps) {
  const token = String(searchParams?.token ?? "").trim();
  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
        {!token ? (
          <ErrorState
            title="Token eksik"
            message="Bu bağlantı geçersiz görünüyor. Yeni bir tane isteyin."
          />
        ) : (
          <VerifyBody token={token} />
        )}
      </main>
    </div>
  );
}

async function VerifyBody({ token }: { token: string }) {
  // Kick off the verification. The action throws via `redirect()` on
  // success; on failure it returns `{ok:false, error}`.
  const result = await verifyMagicLinkAction(token).catch((err) => {
    if (err && typeof err === "object" && "digest" in err) {
      // `redirect()` throws a special Next error — rethrow so the
      // framework can handle it.
      throw err;
    }
    return { ok: false, error: "Beklenmeyen bir hata oluştu." };
  });

  if (!result.ok) {
    return (
      <ErrorState
        title="Giriş başarısız"
        message={result.error ?? "Bağlantı doğrulanamadı."}
      />
    );
  }

  // Should not reach here — the action redirects on success.
  return (
    <div className="flex items-center gap-3 text-text">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span>Giriş yapılıyor…</span>
    </div>
  );
}

function ErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto flex w-full flex-col gap-4 rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
          <AlertCircle className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <h1 className="font-heading text-lg font-bold text-text">{title}</h1>
          <p className="text-sm text-muted">{message}</p>
        </div>
      </header>
      <div className="flex flex-col gap-2">
        <Link
          href="/account/login"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <MailCheck className="h-4 w-4" aria-hidden />
          Yeni giriş bağlantısı iste
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2.5 text-sm font-medium text-text transition hover:bg-background"
        >
          Menüye dön
        </Link>
      </div>
    </div>
  );
}
