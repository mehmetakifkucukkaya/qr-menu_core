"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Button, buttonStyles } from "@/components/ui/Button";

interface AdminErrorScreenProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * The friendly face of an unexpected failure inside the admin: a backend that
 * is briefly unreachable used to end in Next's raw "Application error" page.
 * Production builds hide the real message from the browser, so this shows a
 * plain Turkish explanation plus the digest the agency can look up in the logs.
 */
export function AdminErrorScreen({ error, reset }: AdminErrorScreenProps) {
  useEffect(() => {
    console.error("Admin render failed:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center rounded-2xl bg-danger-soft px-6 py-12 text-center ring-1 ring-danger/20"
    >
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="font-heading text-lg font-semibold text-text">Bir şeyler ters gitti</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Sayfa yüklenirken beklenmedik bir sorun oluştu. Birkaç saniye sonra tekrar deneyin;
        sürerse ajansınıza bildirin.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-outline">Hata kodu: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>Tekrar dene</Button>
        <Link href="/admin" className={buttonStyles({ variant: "outline" })}>
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
