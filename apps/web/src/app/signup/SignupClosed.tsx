import Link from "next/link";
import { Lock } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { buttonStyles } from "@/components/ui/Button";

/** Shown at /signup while public registration is closed (the pilot). */
export function SignupClosed() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Container size="sm" className="w-full">
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Lock className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="font-heading text-2xl font-bold text-text">Kayıt şu an kapalı</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            Yeni işletme hesapları şimdilik ajansımız tarafından açılıyor. Hesabınızı açtırmak için
            bizimle iletişime geçin; hesabınız varsa giriş yapabilirsiniz.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/login" className={buttonStyles({ variant: "primary" })}>
              Giriş yap
            </Link>
            <Link href="/" className={buttonStyles({ variant: "outline" })}>
              Ana sayfaya dön
            </Link>
          </div>
        </Card>
      </Container>
    </main>
  );
}
