import Link from "next/link";
import { cookies } from "next/headers";
import { FileUp, Plus } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import {
  AdminApiError,
  fetchImportDrafts,
} from "@/lib/api-admin";
import type { MenuImportDraftSummary, MenuImportStatus } from "@/types/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * Visual mapping of `MenuImportStatus` → badge styling + Turkish label.
 *
 * Notes:
 *  - `parsed` is the operator's "happy state" (AI success, awaiting
 *    review).
 *  - `confirmed` is terminal; the row links out to the created menu.
 *  - `discarded` is terminal; muted in the list (visible for audit but
 *    not actionable).
 */
const STATUS_STYLES: Record<MenuImportStatus, { label: string; className: string }> = {
  pending: {
    label: "Bekliyor",
    className: "bg-muted/20 text-muted",
  },
  parsing: {
    label: "AI analiz ediyor",
    className: "bg-primary/10 text-primary",
  },
  parsed: {
    label: "İnceleniyor",
    className: "bg-primary/10 text-primary",
  },
  confirmed: {
    label: "Onaylandı",
    className: "bg-primary/20 text-primary",
  },
  discarded: {
    label: "İptal",
    className: "bg-muted/20 text-muted line-through",
  },
  failed: {
    label: "Başarısız",
    className: "bg-danger-soft text-danger",
  },
};

function StatusBadge({ status }: { status: MenuImportStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.parsed;
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
        style.className
      }
    >
      {style.label}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatConfidence(avg: number | null): string {
  if (avg === null || avg === undefined) return "—";
  return `${(avg * 100).toFixed(0)}%`;
}

/**
 * `/admin/pdf-import` — operator landing page for the AI PDF import
 * feature (Sprint 7B). Lists the last 20 drafts (newest first) for the
 * current tenant; each row links to the detail / edit page.
 *
 * Server component responsibilities:
 *   1. Fetch `MenuImportDraftSummary[]` from `/pdf-import/drafts/` —
 *      tenant-scoped on the backend, so no `?organization_id` filter is
 *      passed.
 *   2. Render an empty-state CTA when the tenant has never uploaded a
 *      PDF.
 *   3. Surface non-404 errors via `AdminErrorState` instead of letting
 *      them bubble up to the layout error boundary.
 *
 * Discardable drafts (`pending` / `parsing` / `parsed` / `failed`) get a
 * destructive action via a tiny client island colocated with the detail
 * page; this page stays a pure server component for the SSR round-trip.
 */
export default async function PdfImportListPage() {
  const cookieHeader = readCookieHeader();

  let drafts: MenuImportDraftSummary[] = [];
  let loadError: string | null = null;

  try {
    drafts = await fetchImportDrafts({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
      drafts = [];
    } else {
      throw err;
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            V2 — Yapay zeka destekli
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">PDF Import</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            PDF menülerini yapay zeka ile tarayın, kategorileri ve ürünleri otomatik
            çıkarılsın. İnceledikten sonra tek tıkla canlı menüye dönüştürün. Son
            20 import draft&apos;ınız burada listelenir.
          </p>
        </div>
        <Link
          href="/admin/pdf-import/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Yeni PDF Import
        </Link>
      </header>

      {loadError ? (
        <AdminErrorState
          title="Import draft&apos;ları yüklenemedi"
          message={loadError}
          code="admin.pdf_import.list_failed"
        />
      ) : drafts.length === 0 ? (
        <AdminEmptyState
          icon={<FileUp className="h-8 w-8" aria-hidden />}
          title="Henüz PDF import yok"
          message="İlk PDF menünüzü yükleyin. AI sizin için kategorileri ve ürünleri otomatik çıkaracak; siz sadece hızlıca gözden geçirip onaylayacaksınız."
          action={
            <Link
              href="/admin/pdf-import/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              İlk PDF&apos;i yükle
            </Link>
          }
        />
      ) : (
        <section
          aria-label="PDF import draft listesi"
          className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
        >
          <table className="w-full table-auto border-collapse text-left">
            <thead className="bg-background">
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2 font-medium">Dosya</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 font-medium">AI sağlayıcı</th>
                <th className="px-4 py-2 text-center font-medium">Öğe</th>
                <th className="px-4 py-2 text-center font-medium">Güven</th>
                <th className="px-4 py-2 font-medium">Yüklendi</th>
                <th className="px-4 py-2 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((d) => {
                const detailHref =
                  d.status === "confirmed"
                    ? `/admin/menus/${d.menu_id ?? ""}`
                    : `/admin/pdf-import/drafts/${d.id}`;
                return (
                  <tr
                    key={d.id}
                    className="border-t border-border text-sm text-text transition hover:bg-background/60"
                  >
                    <td className="px-4 py-3 align-middle">
                      <Link
                        href={detailHref}
                        className="group inline-flex items-center gap-2 font-medium text-text hover:text-primary focus:outline-none focus-visible:text-primary"
                      >
                        <FileUp className="h-4 w-4 text-muted transition group-hover:text-primary" />
                        {d.raw_pdf_filename || (
                          <span className="italic text-muted">(isimsiz)</span>
                        )}
                      </Link>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
                        #{d.id}
                      </p>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {d.ai_provider ? (
                        <div className="flex flex-col">
                          <span className="text-sm capitalize text-text">
                            {d.ai_provider}
                          </span>
                          {d.ai_model ? (
                            <span className="font-mono text-[10px] text-muted">
                              {d.ai_model}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs italic text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center align-middle">
                      <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs font-semibold tabular-nums text-text">
                        {d.item_count.toLocaleString("tr-TR")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center align-middle">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums " +
                          (d.confidence_avg !== null && d.confidence_avg < 0.5
                            ? "bg-danger-soft text-danger"
                            : "bg-muted/20 text-text")
                        }
                      >
                        {formatConfidence(d.confidence_avg)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-xs text-muted">
                      {new Date(d.created_at).toLocaleString("tr-TR")}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={detailHref}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          {d.status === "confirmed" ? "Menüyü aç" : "Görüntüle"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        Import edilen PDF&apos;ler <code className="font-mono">MEDIA_ROOT/pdf_imports/&lt;org_id&gt;/</code>{" "}
        altında saklanır. Maksimum dosya boyutu 10 MB, format{" "}
        <code className="font-mono">application/pdf</code>.
      </p>
    </div>
  );
}