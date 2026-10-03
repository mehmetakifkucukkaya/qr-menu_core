"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, ChevronUp, Edit3, Loader2, Trash2 } from "lucide-react";
import clsx from "clsx";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import {
  deleteCategory,
  reorderCategories,
} from "@/lib/api-admin";
import type { AdminMenuCategory } from "@/types/admin";

interface CategoriesReorderProps {
  menuId: number;
  initialCategories: AdminMenuCategory[];
  csrfToken: string | null;
}

/**
 * CategoriesReorder — interactive list of categories with up/down move
 * buttons + delete + edit links.
 *
 * Reorder strategy:
 *   1. The list is held in client state, sorted by sort_order.
 *   2. Up/Down swaps adjacent items locally.
 *   3. After every swap, the client POSTs the new ordered_ids to
 *      /api/v1/admin/categories/reorder and `router.refresh()`s so the
 *      server-side category list re-fetches with the new sort_order.
 *
 * Why a dedicated endpoint instead of per-row PATCH?
 *   - Single round-trip; cheaper.
 *   - Avoids race conditions on multiple quick clicks.
 */
export function CategoriesReorder({
  menuId,
  initialCategories,
  csrfToken,
}: CategoriesReorderProps) {
  const router = useRouter();
  const sorted = [...initialCategories].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const [items, setItems] = useState<AdminMenuCategory[]>(sorted);
  const [pending, setPending] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminMenuCategory | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const persistOrder = async (next: AdminMenuCategory[]) => {
    if (!csrfToken) {
      setPendingError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setPending(true);
    setPendingError(null);
    try {
      await reorderCategories(
        menuId,
        next.map((c) => c.id),
        { csrfToken },
      );
      router.refresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Sıralama kaydedilemedi.";
      setPendingError(msg);
    } finally {
      setPending(false);
    }
  };

  const move = (idx: number, direction: -1 | 1) => {
    const next = [...items];
    const swap = idx + direction;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setItems(next);
    void persistOrder(next);
  };

  const confirmDelete = async () => {
    if (!deleting || !csrfToken) return;
    setDeletingId(deleting.id);
    try {
      await deleteCategory(deleting.id, { csrfToken });
      setItems((prev) => prev.filter((c) => c.id !== deleting.id));
      router.refresh();
    } catch {
      // Surface via the same banner as reorder failures.
      setPendingError("Kategori silinemedi.");
    } finally {
      setDeletingId(null);
      setDeleting(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      {pendingError ? (
        <div
          role="alert"
          className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          {pendingError}
        </div>
      ) : null}

      <ul
        aria-label="Kategori sıralaması"
        className="divide-y divide-border rounded-md border border-border bg-background"
      >
        {items.map((c, idx) => (
          <li
            key={c.id}
            className={clsx(
              "flex items-center gap-2 px-3 py-2 transition",
              pending && "opacity-60",
            )}
          >
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="Yukarı taşı"
                onClick={() => move(idx, -1)}
                disabled={pending || idx === 0}
                className="rounded p-1 text-muted transition hover:bg-surface hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Aşağı taşı"
                onClick={() => move(idx, 1)}
                disabled={pending || idx === items.length - 1}
                className="rounded p-1 text-muted transition hover:bg-surface hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{c.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                /{c.slug} · sıra {c.sort_order}
              </p>
            </div>
            <span
              className={
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                (c.is_active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/20 text-muted")
              }
            >
              {c.is_active ? "Aktif" : "Pasif"}
            </span>
            <Link
              href={`/admin/menus/${menuId}/categories/${c.id}/edit`}
              className="rounded-md border border-border bg-surface p-2 text-text transition hover:bg-background"
              aria-label="Kategoriyi düzenle"
            >
              <Edit3 className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => setDeleting(c)}
              disabled={deletingId === c.id}
              className="rounded-md border border-danger/30 bg-danger-soft p-2 text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Kategoriyi sil"
            >
              {deletingId === c.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            <Link
              href={`/admin/menus/${menuId}/categories/${c.id}/items`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text transition hover:bg-background"
              aria-label="Ürünleri yönet"
            >
              Ürünler
              <ChevronRight className="h-3 w-3" />
            </Link>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        title="Kategoriyi sil"
        description="Bu kategoriye bağlı tüm ürünler de silinir. Bu işlem geri alınamaz."
        confirmLabel={deletingId !== null ? "Siliniyor…" : "Evet, sil"}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (deletingId === null) setDeleting(null);
        }}
        loading={deletingId !== null}
      />
    </div>
  );
}
