"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";

import { ImportItemRow } from "@/app/(admin)/_components/ImportItemRow";
import type { MenuImportItem } from "@/types/admin";

interface ImportPreviewTableProps {
  items: MenuImportItem[];
  /** CSRF token — required for the per-row PATCH. */
  csrfToken: string | null;
  /** Whether the parent draft is still editable (status === "parsed"). */
  readOnly: boolean;
  /**
   * Notifies the parent when an item was successfully updated. The
   * parent uses this to keep a canonical "latest draft" copy in scope
   * for the confirm modal and downstream steps.
   */
  onItemSaved?: (next: MenuImportItem) => void;
  /**
   * Roll up an inline error to the surrounding page so the operator
   * sees it even when they&apos;re scrolled past the failing row.
   */
  onItemError?: (itemId: number, message: string) => void;
}

/**
 * ImportPreviewTable — groups items by `category_name` and renders each
 * group as a category section with an inline-editable header.
 *
 * Editing the category header PATCHes every item in that group with
 * the new `category_name` (backend sets `is_edited=true` on each). We
 * batch this in sequence to avoid overwhelming the API; the per-row
 * row save path is unchanged.
 *
 * Items themselves are rendered with `ImportItemRow`, which handles
 * name / description / price inline editing with debounced PATCHes.
 */
export function ImportPreviewTable({
  items,
  csrfToken,
  readOnly,
  onItemSaved,
  onItemError,
}: ImportPreviewTableProps) {
  // Group items by category_name. We use a Map to preserve insertion
  // order (first occurrence of each category becomes its anchor).
  const groups = useMemo(() => {
    const map = new Map<string, MenuImportItem[]>();
    for (const it of items) {
      const key = it.category_name || "Genel";
      const bucket = map.get(key);
      if (bucket) bucket.push(it);
      else map.set(key, [it]);
    }
    return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }));
  }, [items]);

  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        AI hiç öğe çıkaramadı. PDF&apos;in metin içerdiğinden emin olun.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <CategoryGroup
          key={group.name}
          categoryName={group.name}
          items={group.rows}
          csrfToken={csrfToken}
          readOnly={readOnly}
          onItemSaved={onItemSaved}
          onItemError={onItemError}
        />
      ))}
    </div>
  );
}

interface CategoryGroupProps {
  categoryName: string;
  items: MenuImportItem[];
  csrfToken: string | null;
  readOnly: boolean;
  onItemSaved?: (next: MenuImportItem) => void;
  onItemError?: (itemId: number, message: string) => void;
}

function CategoryGroup({
  categoryName: initialName,
  items,
  csrfToken,
  readOnly,
  onItemSaved,
  onItemError,
}: CategoryGroupProps) {
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the parent swaps items (e.g. after a router.refresh).
  useEffect(() => {
    setName(initialName);
    setDraft(initialName);
  }, [initialName]);

  const flushRename = async () => {
    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === name) {
      setDraft(name);
      return;
    }
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // PATCH every item in the group sequentially. The backend sets
      // is_edited on each; we surface the last updated copy via
      // onItemSaved so the parent can keep a consistent draft snapshot.
      for (const it of items) {
        // Lazy import — keeps the table file's top-level imports tight.
        const { updateImportItem } = await import("@/lib/api-admin");
        const updated = await updateImportItem(
          it.id,
          { category_name: trimmed },
          { csrfToken },
        );
        onItemSaved?.({
          ...it,
          category_name: updated.category_name ?? trimmed,
          is_edited: updated.is_edited,
        });
      }
      setName(trimmed);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Kategori adı kaydedilemedi.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-label={`Kategori: ${name}`}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-background/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <input
            type="text"
            value={draft}
            disabled={readOnly || saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void flushRename()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="min-w-0 max-w-xs rounded-md border border-transparent bg-surface px-2 py-1 font-heading text-base font-bold text-text transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70"
          />
          {saving ? (
            <span className="text-[10px] uppercase tracking-wider text-primary">
              kaydediliyor…
            </span>
          ) : name !== initialName ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
              <Pencil className="h-3 w-3" aria-hidden />
              düzenlendi
            </span>
          ) : null}
          <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
            {items.length} öğe
          </span>
        </div>
      </header>
      {error ? (
        <p
          role="alert"
          className="border-b border-accent/40 bg-accent/5 px-4 py-2 text-xs text-accent"
        >
          {error}
        </p>
      ) : null}
      <table className="w-full table-auto border-collapse text-left">
        <thead className="bg-background">
          <tr className="text-[10px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-medium">İsim</th>
            <th className="px-3 py-2 font-medium">Açıklama</th>
            <th className="px-3 py-2 font-medium">Fiyat</th>
            <th className="px-3 py-2 font-medium">Etiketler</th>
            <th className="px-3 py-2 font-medium">Güven</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <ImportItemRow
              key={it.id}
              item={it}
              csrfToken={csrfToken}
              readOnly={readOnly}
              onSaved={onItemSaved}
              onError={onItemError}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}