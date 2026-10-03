"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Edit3, ImageOff, Loader2, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";

import { ConfirmDialog } from "@/app/(admin)/_components/ConfirmDialog";
import { PriceEditor } from "@/app/(admin)/_components/PriceEditor";
import { SmartImage } from "@/components/ui/SmartImage";
import {
  deleteItem,
  updateItem,
} from "@/lib/api-admin";
import type { AdminMenuItem } from "@/types/admin";

interface ItemsListClientProps {
  menuId: number;
  categoryId: number;
  initialItems: AdminMenuItem[];
  csrfToken: string | null;
}

/**
 * ItemsListClient — interactive table of items for a category.
 *
 * Quick actions (no full edit page round-trip):
 *   - PriceEditor → PATCH price
 *   - Toggle is_active / is_available → PATCH boolean
 *
 * Full edit lives at /admin/menus/[menuId]/categories/[categoryId]/items/[itemId]/edit.
 * Delete goes through ConfirmDialog → DELETE → router.refresh().
 *
 * Search box filters by name (TR) + description; client-side filter to
 * avoid an extra round-trip on small lists.
 */
export function ItemsListClient({
  menuId,
  categoryId,
  initialItems,
  csrfToken,
}: ItemsListClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<AdminMenuItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "available" | "unavailable">("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminMenuItem | null>(null);

  // Photos are optional. Only when at least one item has one does the list
  // reserve a thumbnail column (an empty tile for the others), so a business
  // that runs a text-only menu never sees a column of empty placeholders.
  const anyPhoto = useMemo(() => items.some((it) => Boolean(it.image)), [items]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "active" && !it.is_active) return false;
      if (filter === "available" && !(it.is_active && it.is_available)) return false;
      if (filter === "unavailable" && it.is_available) return false;
      if (!s) return true;
      return (
        it.name.toLowerCase().includes(s) ||
        (it.description ?? "").toLowerCase().includes(s)
      );
    });
  }, [items, search, filter]);

  const handlePriceSave = async (id: number, next: string) => {
    if (!csrfToken) throw new Error("CSRF token eksik.");
    await updateItem(id, { price: next }, { csrfToken });
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, price: next } : it)),
    );
    router.refresh();
  };

  const toggleFlag = async (
    id: number,
    flag: "is_active" | "is_available",
  ) => {
    if (!csrfToken) {
      setError("CSRF token eksik.");
      return;
    }
    const current = items.find((it) => it.id === id);
    if (!current) return;
    setBusyId(id);
    try {
      await updateItem(id, { [flag]: !current[flag] }, { csrfToken });
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, [flag]: !current[flag] } : it,
        ),
      );
      router.refresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Güncellenemedi.";
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || !csrfToken) return;
    setBusyId(deleting.id);
    try {
      await deleteItem(deleting.id, { csrfToken });
      setItems((prev) => prev.filter((it) => it.id !== deleting.id));
      router.refresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Ürün silinemedi.";
      setError(msg);
    } finally {
      setBusyId(null);
      setDeleting(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            type="search"
            placeholder="Ürün ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-text placeholder:text-muted/70 focus:outline-none"
            aria-label="Ürün ara"
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Filtre"
          className="inline-flex rounded-md border border-border bg-surface p-1 text-xs"
        >
          {[
            { key: "all", label: "Hepsi" },
            { key: "active", label: "Aktif" },
            { key: "available", label: "Stokta" },
            { key: "unavailable", label: "Tükendi" },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={filter === opt.key}
              onClick={() => setFilter(opt.key as typeof filter)}
              className={clsx(
                "rounded px-2 py-1 font-medium transition",
                filter === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:bg-background",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Link
          href={`/admin/menus/${menuId}/categories/${categoryId}/items/new`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Yeni ürün
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-background p-6 text-center text-sm text-muted">
          {items.length === 0
            ? "Bu kategoride henüz ürün yok."
            : "Aramayla eşleşen ürün bulunamadı."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="table-stack w-full text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Ürün
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Fiyat
                </th>
                <th scope="col" className="px-3 py-2 text-left font-semibold">
                  Durum
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  İşlem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((it) => {
                const busy = busyId === it.id;
                return (
                  <tr
                    key={it.id}
                    className={clsx(
                      "transition hover:bg-background",
                      busy && "opacity-60",
                    )}
                  >
                    <td
                      className={clsx(
                        "px-3 py-2 align-top",
                        anyPhoto ? "max-w-[20rem]" : "max-w-[16rem]",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {anyPhoto ? <ItemThumb src={it.image} /> : null}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-text">{it.name}</p>
                          {it.description ? (
                            <p className="line-clamp-2 text-xs text-muted">
                              {it.description}
                            </p>
                          ) : null}
                          {it.is_featured || it.is_popular || it.is_new ? (
                            <p className="mt-1 flex flex-wrap gap-1 text-[10px] uppercase tracking-wider">
                              {it.is_featured ? (
                                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">
                                  öne çıkan
                                </span>
                              ) : null}
                              {it.is_popular ? (
                                <span className="rounded-full bg-secondary/20 px-1.5 py-0.5 text-secondary">
                                  popüler
                                </span>
                              ) : null}
                              {it.is_new ? (
                                <span className="rounded-full bg-success-soft px-1.5 py-0.5 text-success">
                                  yeni
                                </span>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td data-label="Fiyat" className="px-3 py-2 align-top">
                      <PriceEditor
                        value={it.price}
                        currency={it.currency}
                        loading={busy}
                        onSave={(next) => handlePriceSave(it.id, next)}
                      />
                      {it.compare_at_price ? (
                        <p className="mt-1 text-xs text-muted line-through">
                          {it.compare_at_price} {it.currency}
                        </p>
                      ) : null}
                    </td>
                    <td data-label="Durum" className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <ToggleChip
                          label={it.is_active ? "Aktif" : "Pasif"}
                          tone={it.is_active ? "primary" : "muted"}
                          onClick={() => !busy && toggleFlag(it.id, "is_active")}
                          disabled={busy}
                        />
                        <ToggleChip
                          label={it.is_available ? "Stokta" : "Tükendi"}
                          tone={it.is_available ? "primary" : "muted"}
                          onClick={() => !busy && toggleFlag(it.id, "is_available")}
                          disabled={busy}
                        />
                      </div>
                    </td>
                    <td data-span="full" className="px-3 py-2 align-top">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/admin/menus/${menuId}/categories/${categoryId}/items/${it.id}/edit`}
                          className="inline-flex items-center justify-center rounded-md border border-border bg-surface p-1.5 text-text transition hover:bg-background"
                          aria-label="Ürünü düzenle"
                        >
                          <Edit3 className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setDeleting(it)}
                          disabled={busy}
                          className="inline-flex items-center justify-center rounded-md border border-danger/30 bg-danger-soft p-1.5 text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label="Ürünü sil"
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-center text-xs text-muted">
        {filtered.length} / {items.length} ürün ·{" "}
        <Link
          href={`/admin/menus/${menuId}/categories`}
          className="text-primary hover:underline"
        >
          Kategorilere dön
          <ChevronRight className="ml-0.5 inline h-3 w-3" />
        </Link>
      </p>

      <ConfirmDialog
        open={deleting !== null}
        title="Ürünü sil"
        description="Bu ürün kalıcı olarak silinir. Müşteri menüsünden anında kaldırılır."
        confirmLabel={busyId === deleting?.id ? "Siliniyor…" : "Evet, sil"}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (busyId === null) setDeleting(null);
        }}
        loading={busyId === deleting?.id && deleting !== null}
      />
    </div>
  );
}

function ToggleChip({
  label,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  tone: "primary" | "muted";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
        tone === "primary"
          ? "bg-primary/10 text-primary hover:bg-primary/20"
          : "bg-muted/20 text-muted hover:bg-muted/30",
      )}
    >
      {label}
    </button>
  );
}

/** 48 px photo beside the item name; a quiet empty tile when the item has none. */
function ItemThumb({ src }: { src: string | null }) {
  return (
    <SmartImage
      src={src}
      alt=""
      aria-hidden
      fallback={<ImageOff className="h-5 w-5 text-outline" aria-hidden />}
      wrapperClassName={clsx(
        "h-12 w-12 shrink-0 rounded-lg bg-surface-low",
        src ? "ring-1 ring-black/5" : "border border-dashed border-border",
      )}
    />
  );
}
