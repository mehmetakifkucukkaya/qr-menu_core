"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import { deleteMenu } from "@/lib/api-admin";

interface DeleteMenuButtonProps {
  id: number;
  csrfToken: string | null;
}

/**
 * DeleteMenuButton — client island for the destructive menu delete.
 *
 * The list / detail page is a server component, so this small client
 * component handles the confirm dialog + API call + redirect to the
 * menus list. Renders the trigger button inline.
 */
export function DeleteMenuButton({ id, csrfToken }: DeleteMenuButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const confirm = async () => {
    if (!csrfToken) return;
    setLoading(true);
    try {
      await deleteMenu(id, { csrfToken });
      setOpen(false);
      router.push("/admin/menus");
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
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Trash2 className="h-4 w-4" />
        Sil
      </button>
      <ConfirmDialog
        open={open}
        title="Menüyü sil"
        description="Bu menü ve bağlı tüm kategoriler / ürünler kalıcı olarak silinir. Bu işlem geri alınamaz."
        confirmLabel={loading ? "Siliniyor…" : "Evet, sil"}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        loading={loading}
      />
    </>
  );
}
