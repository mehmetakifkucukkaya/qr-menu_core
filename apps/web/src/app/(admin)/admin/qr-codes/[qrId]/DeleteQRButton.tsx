"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import { deleteQRCode } from "@/lib/api-admin";

interface DeleteQRButtonProps {
  id: number;
  csrfToken: string | null;
}

/**
 * DeleteQRButton — client island for the destructive QR delete.
 *
 * QR deletion is a **soft delete** server-side (is_active flips to false)
 * so the analytics row history is preserved. We surface this in the
 * dialog copy so operators don't expect the PNG to be unreachable.
 */
export function DeleteQRButton({ id, csrfToken }: DeleteQRButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    if (!csrfToken) return;
    setLoading(true);
    try {
      await deleteQRCode(id, { csrfToken });
      setOpen(false);
      router.push("/admin/qr-codes");
      router.refresh();
    } catch {
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
        Sil
      </button>
      <ConfirmDialog
        open={open}
        title="QR kodu sil"
        description="Bu QR kod pasif hale getirilir; tarama geçmişi analitik için korunur. Listeden kaldırılır ve indirme bağlantısı devre dışı kalır. Yanlışlıkla sildiyseniz yeni bir QR oluşturmanız gerekir."
        confirmLabel={loading ? "Siliniyor…" : "Evet, sil"}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        loading={loading}
      />
    </>
  );
}
