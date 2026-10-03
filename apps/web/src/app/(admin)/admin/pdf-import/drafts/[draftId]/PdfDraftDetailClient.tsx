"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, Loader2 } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { PdfConfirmDialog } from "@/app/(admin)/_components/PdfConfirmDialog";
import { ImportPreviewTable } from "@/app/(admin)/_components/ImportPreviewTable";
import { DiscardDraftButton } from "./DiscardDraftButton";
import {
  confirmImportDraft,
  fetchImportDraft,
  AdminApiError,
} from "@/lib/api-admin";
import type { AdminLocaleCode, MenuImportDraftDetail, MenuImportItem } from "@/types/admin";

interface PdfDraftDetailClientProps {
  /** Initial server-rendered draft snapshot. */
  initialDraft: MenuImportDraftDetail;
  /** CSRF token — required for confirm / discard. */
  csrfToken: string | null;
}

/**
 * PdfDraftDetailClient — client island for the draft preview / edit /
 * confirm flow.
 *
 * Responsibilities:
 *  - Hold the canonical draft snapshot in local state so the editable
 *    table can mutate it incrementally (we&apos;d otherwise lose inline
 *    edits on the next server refresh).
 *  - Drive the confirm dialog + the bulk save.
 *  - Drive the discard button via the colocated client island.
 *  - Show inline error banners when individual item PATCHes fail.
 *
 * The parent server component pre-renders the draft + items snapshot
 * so the page is interactive on first paint.
 */
export function PdfDraftDetailClient({
  initialDraft,
  csrfToken,
}: PdfDraftDetailClientProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<MenuImportDraftDetail>(initialDraft);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [rolledError, setRolledError] = useState<string | null>(null);

  const onItemSaved = (next: MenuImportItem) => {
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === next.id ? next : it)),
    }));
  };

  const onItemError = (_id: number, message: string) => {
    setRolledError(message);
  };

  const onConfirm = async (payload: {
    menu_name: string;
    default_locale: AdminLocaleCode;
    is_active: boolean;
  }) => {
    if (!csrfToken) {
      setConfirmError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      const result = await confirmImportDraft(draft.id, payload, { csrfToken });
      setConfirmOpen(false);
      // Best-effort refresh — fetch the latest draft so the
      // `confirmed` status renders before we navigate.
      try {
        const refreshed = await fetchImportDraft(draft.id);
        setDraft(refreshed);
      } catch {
        // Even if the refresh fails we still navigate.
      }
      router.push(`/admin/menus/${result.menu_id}`);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Onay başarısız.";
      setConfirmError(message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const isParsed = draft.status === "parsed";
  const aiSummary =
    draft.ai_provider && draft.ai_model
      ? `${draft.ai_provider} · ${draft.ai_model}`
      : draft.ai_provider ?? "AI";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href="/admin/pdf-import"
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          PDF Import listesi
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {aiSummary}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-text">
            {draft.raw_pdf_filename || (
              <span className="italic text-muted">(isimsiz PDF)</span>
            )}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span
              className={
                "rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider " +
                (draft.status === "parsed"
                  ? "bg-primary/10 text-primary"
                  : draft.status === "confirmed"
                    ? "bg-primary/20 text-primary"
                    : draft.status === "failed"
                      ? "bg-danger-soft text-danger"
                      : "bg-muted/20 text-muted")
              }
            >
              {draft.status}
            </span>
            <span className="font-mono text-[10px]">#{draft.id}</span>
            <span className="font-mono text-[10px]">
              {(draft.raw_pdf_size_bytes / (1024 * 1024)).toFixed(2)} MB
            </span>
            {draft.confidence_avg !== null ? (
              <span
                className={
                  "rounded-full px-2 py-0.5 font-semibold tabular-nums " +
                  (draft.confidence_avg < 0.5
                    ? "bg-danger-soft text-danger"
                    : "bg-muted/20 text-text")
                }
              >
                ort. güven {(draft.confidence_avg * 100).toFixed(0)}%
              </span>
            ) : null}
            <span className="font-mono text-[10px]">
              {draft.items.length} öğe
            </span>
          </div>
          {draft.error ? (
            <p
              role="alert"
              className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger"
            >
              <strong className="mr-1 uppercase tracking-wider">
                {draft.error.code}
              </strong>
              {draft.error.message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isParsed ? (
            <button
              type="button"
              onClick={() => {
                setConfirmError(null);
                setConfirmOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Onayla ve Kaydet
            </button>
          ) : draft.status === "confirmed" && draft.menu_id ? (
            <Link
              href={`/admin/menus/${draft.menu_id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Menüyü aç
            </Link>
          ) : null}
          {draft.status !== "confirmed" && draft.status !== "discarded" ? (
            <DiscardDraftButton id={draft.id} csrfToken={csrfToken} />
          ) : null}
        </div>
      </header>

      {rolledError ? (
        <AdminErrorState
          title="Bir öğe kaydedilemedi"
          message={rolledError}
          code="admin.pdf_import.item_update_failed"
        />
      ) : null}

      <ImportPreviewTable
        items={draft.items}
        csrfToken={csrfToken}
        readOnly={!isParsed}
        onItemSaved={onItemSaved}
        onItemError={onItemError}
      />

      {isParsed ? (
        <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
          Satırlardaki inline değişiklikler 500ms debounce ile otomatik
          kaydedilir. &quot;Onayla ve Kaydet&quot; tüm taslağı atomik olarak canlı menüye
          dönüştürür.
        </p>
      ) : null}

      {confirmLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 inline-flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm shadow-floating"
        >
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Menü oluşturuluyor…
        </div>
      ) : null}

      <PdfConfirmDialog
        open={confirmOpen}
        aiSummary={aiSummary}
        itemCount={draft.items.length}
        confidenceAvg={draft.confidence_avg}
        loading={confirmLoading}
        error={confirmError}
        onConfirm={onConfirm}
        onCancel={() => {
          if (!confirmLoading) setConfirmOpen(false);
        }}
      />
    </div>
  );
}