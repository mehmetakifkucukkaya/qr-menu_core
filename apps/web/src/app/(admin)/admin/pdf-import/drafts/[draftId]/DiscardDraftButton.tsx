"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import { discardImportDraft } from "@/lib/api-admin";

interface DiscardDraftButtonProps {
  id: number;
  csrfToken: string | null;
}

/**
 * DiscardDraftButton — client island for the destructive draft
 * discard.
 *
 * Mirrors `DeleteMenuButton` / `DeleteQRButton` — server-rendered list /
 * detail pages stay pure server components, while this small client
 * piece handles the confirm modal + API call + redirect.
 */
export function DiscardDraftButton({ id, csrfToken }: DiscardDraftButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await discardImportDraft(id, { csrfToken });
      setOpen(false);
      router.push("/admin/pdf-import");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Draft silinemedi.";
      setError(message);
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-danger"
      >
        <Trash2 className="h-4 w-4" />
        Draft&apos;i sil
      </button>
      <ConfirmDialog
        open={open}
        title="Import draft&apos;ını sil"
        description="Bu PDF import taslağı silinir. PDF dosyası sunucudan kaldırılır, oluşturulmuş bir menü varsa etkilenmez. Yanlışlıkla silerseniz PDF&apos;i tekrar yüklemeniz gerekir."
        confirmLabel={loading ? "Siliniyor…" : "Evet, sil"}
        onConfirm={confirm}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        loading={loading}
      />
      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}