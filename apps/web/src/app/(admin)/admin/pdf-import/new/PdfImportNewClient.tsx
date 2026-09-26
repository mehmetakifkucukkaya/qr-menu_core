"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PdfUploadDropzone } from "@/app/(admin)/_components/PdfUploadDropzone";
import { ParseProgressIndicator } from "@/app/(admin)/_components/ParseProgressIndicator";
import type { PdfUploadResponse } from "@/types/admin";

interface PdfImportNewClientProps {
  /** CSRF token — required for the multipart POST. */
  csrfToken: string | null;
}

/**
 * Client island for the upload flow. Drives two states:
 *
 *  - **idle**    — dropzone visible, ready for a file pick.
 *  - **parsing** — dropzone hidden, polling indicator mounted. We
 *                  transition here immediately after a successful upload
 *                  when the backend reported status="parsing" (today
 *                  the endpoint parses synchronously and returns
 *                  status="parsed", but we keep the fallback for future
 *                  background-job support — see D-021).
 *
 * On `parsed` we navigate straight to the detail page; the polling
 * indicator only mounts when the backend signals an async parse.
 */
export function PdfImportNewClient({
  csrfToken,
}: PdfImportNewClientProps) {
  const router = useRouter();
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  const onSuccess = (result: PdfUploadResponse) => {
    if (result.status === "parsed") {
      // Synchronous parse — go straight to the detail view.
      router.push(`/admin/pdf-import/drafts/${result.draft_id}`);
      router.refresh();
      return;
    }
    // Anything else (parsing / failed / pending) — mount the poller.
    setActiveDraftId(result.draft_id);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href="/admin/pdf-import"
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          PDF Import listesi
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          V2 — Yapay zeka destekli
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">
          Yeni PDF Import
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Bir PDF menü yükleyin. OpenAI GPT-4o öncelikli olarak kategorileri ve
          ürünleri çıkaracak; başarısız olursa Anthropic Claude devreye girecek.
          Yükleme bittiğinde önizleme sayfasına yönlendirileceksiniz.
        </p>
      </header>

      {activeDraftId ? (
        <ParseProgressIndicator draftId={activeDraftId} />
      ) : (
        <PdfUploadDropzone csrfToken={csrfToken} onSuccess={onSuccess} />
      )}

      <section
        aria-label="Süreç"
        className="rounded-xl border border-dashed border-border bg-background px-5 py-4 text-xs text-muted"
      >
        <p className="font-semibold uppercase tracking-wider text-text">
          Nasıl çalışır?
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>PDF&apos;i sürükleyin veya seçin (maks. 10 MB).</li>
          <li>
            AI sağlayıcı PDF&apos;ten kategorileri, ürünleri, fiyatları ve alerjenleri
            çıkarır.
          </li>
          <li>
            Önizleme sayfasında her satırı düzenleyebilir, güven skoru düşük
            alanları kırmızı işaretlenmiş halde görürsünüz.
          </li>
          <li>
            &quot;Onayla ve Kaydet&quot; modalı menü adı + aktif/pasif seçimi sunar;
            onayladığınızda menü canlıya geçer.
          </li>
        </ol>
      </section>
    </div>
  );
}