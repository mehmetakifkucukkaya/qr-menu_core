import Link from "next/link";
import { SearchX } from "lucide-react";

import { buttonStyles } from "@/components/ui/Button";

export default function PublicMenuNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center shadow-lg ring-1 ring-border/60">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-secondary-soft text-secondary">
          <SearchX className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-text">
          İşletme bulunamadı
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
          QR kodunuzdaki bağlantı geçersiz olabilir veya bu işletme şu anda
          yayında değil.
        </p>
        <Link
          href="/"
          className={buttonStyles({
            size: "lg",
            fullWidth: true,
            className: "mt-6",
          })}
        >
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}
