"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import {
  AdminApiError,
  resetUsage,
} from "@/lib/api-admin";

interface ResetUsageButtonProps {
  /** CSRF token — required for the POST. */
  csrfToken: string | null;
}

/**
 * ResetUsageButton — Sprint B2 (superuser-only demo helper).
 *
 * Wraps the destructive `POST /api/v1/admin/billing/reset-usage/` call
 * in a `<ConfirmDialog>` so operators can't trip the helper by
 * accident. The backend itself enforces the `is_superuser` check; the
 * UI only renders the button when the parent's user payload has
 * `is_superuser = true` (see `/admin/billing/page.tsx`).
 */
export function ResetUsageButton({ csrfToken }: ResetUsageButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!csrfToken) {
      setError("CSRF token eksik — lütfen sayfayı yenileyin.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetUsage(csrfToken);
      setOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Beklenmeyen bir hata oluştu.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-semibold text-text transition hover:border-danger/30 hover:bg-danger-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
      >
        <RotateCcw className="h-4 w-4" aria-hidden />
        Demo: aylık kullanımı sıfırla
      </button>

      <ConfirmDialog
        open={open}
        title="Aylık kullanım sayaçlarını sıfırla"
        description="Bu işlem geri alınamaz. Tüm görüntülenme, tarama ve AI sayaçları sıfırlanır. Demo amaçlıdır."
        confirmLabel={submitting ? "Sıfırlanıyor…" : "Sıfırla"}
        loading={submitting}
        onCancel={() => {
          if (!submitting) setOpen(false);
        }}
        onConfirm={handleConfirm}
      />

      {error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}