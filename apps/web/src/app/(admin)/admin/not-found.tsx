import Link from "next/link";
import { SearchX } from "lucide-react";

import { buttonStyles } from "@/components/ui/Button";

/** `notFound()` inside an admin page (a menu or order that does not exist). */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl bg-surface-low px-6 py-12 text-center ring-1 ring-border">
      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <SearchX className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="font-heading text-lg font-semibold text-text">Sayfa bulunamadı</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Aradığınız kayıt silinmiş ya da hiç var olmamış olabilir.
      </p>
      <Link href="/admin" className={buttonStyles({ variant: "primary", className: "mt-6" })}>
        Ana sayfaya dön
      </Link>
    </div>
  );
}
