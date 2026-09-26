import Link from "next/link";

export default function PublicMenuNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-lg border border-border bg-surface p-6 text-center shadow-card">
        <h1 className="font-heading text-xl font-bold text-text">
          İşletme bulunamadı
        </h1>
        <p className="mt-2 text-sm text-muted">
          QR kodunuzdaki bağlantı geçersiz olabilir veya bu işletme
          şu anda yayında değil.
        </p>
        <Link
          href="/"
          className="touch-target mt-5 inline-flex items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  );
}
