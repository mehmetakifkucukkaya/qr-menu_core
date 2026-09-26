"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pencil, X } from "lucide-react";

import { updateImportItem, AdminApiError } from "@/lib/api-admin";
import type { MenuImportItem, MenuImportItemPatch } from "@/types/admin";

interface ImportItemRowProps {
  item: MenuImportItem;
  /** CSRF token — required for the PATCH. */
  csrfToken: string | null;
  /** Whether the parent draft is still editable (status === "parsed"). */
  readOnly: boolean;
  /**
   * Debounce window before the row PATCHes to the backend (ms). Default
   * 500ms matches the spec.
   */
  debounceMs?: number;
  /**
   * Called whenever the local value diverges from the server copy AND
   * a save attempt was triggered. Parent uses this to flash a subtle
   * "saved" indicator + react to errors.
   */
  onSaved?: (next: MenuImportItem) => void;
  onError?: (itemId: number, message: string) => void;
}

type EditableField = keyof MenuImportItemPatch;

interface FieldState {
  /** Local copy the user is currently typing. */
  draft: string;
  /** Server-authoritative value (last successful save). */
  baseline: string;
}

/**
 * ImportItemRow — single editable row in the import preview table.
 *
 * Edit strategy:
 *  - Each editable cell holds its own `draft` state. Local changes are
 *    stored until the field is committed via blur or Enter.
 *  - We debounce PATCHes by `debounceMs` (default 500ms) so rapid
 *    typing doesn't generate one request per keystroke. The blur
 *    event flushes any pending debounced save immediately.
 *  - On save success the row flips back to read mode and the parent's
 *    `onSaved` is fired so it can refresh the underlying draft copy.
 *  - On save error we surface a red border + the error message inline
 *    and let the user retry by re-blurring (or pressing Enter again).
 *
 * The row is **read-only** when the parent draft has left the
 * `parsed` state — confirming or discarding locks the items.
 */
export function ImportItemRow({
  item,
  csrfToken,
  readOnly,
  debounceMs = 500,
  onSaved,
  onError,
}: ImportItemRowProps) {
  // Per-field local state — we only re-render the cell that changed,
  // not the whole row, by keeping each cell a controlled component.
  const [name, setName] = useState<FieldState>({
    draft: item.name,
    baseline: item.name,
  });
  const [description, setDescription] = useState<FieldState>({
    draft: item.description,
    baseline: item.description,
  });
  const [price, setPrice] = useState<FieldState>({
    draft: item.price ?? "",
    baseline: item.price ?? "",
  });

  // Sync state if the parent passes a new item (e.g. server refresh).
  useEffect(() => {
    setName({ draft: item.name, baseline: item.name });
    setDescription({ draft: item.description, baseline: item.description });
    setPrice({ draft: item.price ?? "", baseline: item.price ?? "" });
  }, [item]);

  const [savingField, setSavingField] = useState<EditableField | null>(null);
  const [errorField, setErrorField] = useState<EditableField | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEdited, setIsEdited] = useState<boolean>(item.is_edited);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup pending timer on unmount.
  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    },
    [],
  );

  /**
   * Build the PATCH payload from the current diff between `draft` and
   * `baseline` for the supplied field. Returns `null` when nothing
   * changed (we skip the round-trip — the backend rejects no-op saves
   * with `item.no_changes` anyway).
   */
  const buildPatch = useCallback(
    (field: EditableField, draft: string, baseline: string): MenuImportItemPatch | null => {
      if (draft === baseline) return null;
      if (field === "price") {
        // Send null when the user clears the price input.
        const normalized = draft.trim() === "" ? null : draft.trim();
        const baselineNormalized =
          baseline.trim() === "" ? null : baseline.trim();
        if (normalized === baselineNormalized) return null;
        return { price: normalized };
      }
      const trimmed = draft.trim();
      if (trimmed === baseline) return null;
      return { [field]: trimmed } as MenuImportItemPatch;
    },
    [],
  );

  const performSave = useCallback(
    async (field: EditableField, value: string, baseline: string) => {
      if (!csrfToken) {
        const msg = "CSRF token eksik. Sayfayı yenileyin.";
        setErrorField(field);
        setErrorMsg(msg);
        onError?.(item.id, msg);
        return;
      }
      const payload = buildPatch(field, value, baseline);
      if (!payload) return; // nothing to do — silently skip

      setSavingField(field);
      setErrorField(null);
      setErrorMsg(null);
      try {
        const updated = await updateImportItem(item.id, payload, { csrfToken });
        setIsEdited(updated.is_edited);
        // Reset baseline to the (trimmed) value the server echoed.
        const newBaseline =
          field === "price"
            ? (updated.price ?? "")
            : field === "name"
              ? updated.name
              : (updated as unknown as { description: string }).description ??
                "";
        if (field === "name") setName((s) => ({ ...s, baseline: newBaseline }));
        if (field === "description")
          setDescription((s) => ({ ...s, baseline: newBaseline }));
        if (field === "price")
          setPrice((s) => ({ ...s, baseline: newBaseline }));
        onSaved?.({
          ...item,
          ...payload,
          is_edited: true,
        });
      } catch (err) {
        const msg =
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Kayıt başarısız.";
        setErrorField(field);
        setErrorMsg(msg);
        onError?.(item.id, msg);
      } finally {
        setSavingField(null);
      }
    },
    [csrfToken, item, buildPatch, onError, onSaved],
  );

  /** Queue a debounced save — used by `onChange` handlers. */
  const queueSave = useCallback(
    (field: EditableField, value: string, baseline: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        void performSave(field, value, baseline);
      }, debounceMs);
    },
    [performSave, debounceMs],
  );

  /** Flush immediately (used by blur / Enter). */
  const flushSave = useCallback(
    (field: EditableField, value: string, baseline: string) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      void performSave(field, value, baseline);
    },
    [performSave],
  );

  const lowConfidence = item.confidence < 0.5;

  const cellClass =
    "block w-full rounded-md border border-transparent bg-surface px-2 py-1 text-sm text-text transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-70";
  const errorCellClass =
    "block w-full rounded-md border border-accent bg-surface px-2 py-1 text-sm text-text transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

  return (
    <tr
      className={
        "border-t border-border align-top text-sm transition " +
        (lowConfidence
          ? "bg-accent/5 hover:bg-accent/10"
          : "hover:bg-background/60")
      }
    >
      {/* Name */}
      <td className="px-3 py-2">
        <input
          type="text"
          value={name.draft}
          disabled={readOnly || savingField === "name"}
          onChange={(e) => {
            const v = e.target.value;
            setName((s) => ({ ...s, draft: v }));
            queueSave("name", v, name.baseline);
          }}
          onBlur={() => flushSave("name", name.draft, name.baseline)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              flushSave("name", name.draft, name.baseline);
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-invalid={errorField === "name" || undefined}
          className={errorField === "name" ? errorCellClass : cellClass}
        />
        {errorField === "name" && errorMsg ? (
          <p role="alert" className="mt-1 text-[11px] text-accent">
            {errorMsg}
          </p>
        ) : null}
      </td>

      {/* Description */}
      <td className="px-3 py-2">
        <textarea
          value={description.draft}
          disabled={readOnly || savingField === "description"}
          onChange={(e) => {
            const v = e.target.value;
            setDescription((s) => ({ ...s, draft: v }));
            queueSave("description", v, description.baseline);
          }}
          onBlur={() => flushSave("description", description.draft, description.baseline)}
          rows={2}
          aria-invalid={errorField === "description" || undefined}
          className={(errorField === "description" ? errorCellClass : cellClass) + " resize-y"}
        />
        {errorField === "description" && errorMsg ? (
          <p role="alert" className="mt-1 text-[11px] text-accent">
            {errorMsg}
          </p>
        ) : null}
      </td>

      {/* Price + currency */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="decimal"
            value={price.draft}
            disabled={readOnly || savingField === "price"}
            onChange={(e) => {
              const v = e.target.value;
              setPrice((s) => ({ ...s, draft: v }));
              queueSave("price", v, price.baseline);
            }}
            onBlur={() => flushSave("price", price.draft, price.baseline)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                flushSave("price", price.draft, price.baseline);
                (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder="—"
            aria-invalid={errorField === "price" || undefined}
            className={(errorField === "price" ? errorCellClass : cellClass) + " w-24 tabular-nums"}
          />
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
            {item.currency}
          </span>
        </div>
        {errorField === "price" && errorMsg ? (
          <p role="alert" className="mt-1 text-[11px] text-accent">
            {errorMsg}
          </p>
        ) : null}
      </td>

      {/* Allergens + dietary tags (read-only chips for now) */}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {item.allergens.length === 0 && item.dietary_tags.length === 0 ? (
            <span className="text-xs italic text-muted">—</span>
          ) : (
            <>
              {item.allergens.map((a) => (
                <span
                  key={`a-${a}`}
                  className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent"
                  title={`Alerjen: ${a}`}
                >
                  {a}
                </span>
              ))}
              {item.dietary_tags.map((t) => (
                <span
                  key={`t-${t}`}
                  className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
                  title={`Diyet etiketi: ${t}`}
                >
                  {t}
                </span>
              ))}
            </>
          )}
        </div>
      </td>

      {/* Confidence + save indicator + edited badge */}
      <td className="px-3 py-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className={
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums " +
                (lowConfidence
                  ? "bg-accent/10 text-accent"
                  : item.confidence < 0.8
                    ? "bg-muted/30 text-text"
                    : "bg-primary/10 text-primary")
              }
              title="AI güven skoru (0–1)"
            >
              {(item.confidence * 100).toFixed(0)}%
            </span>
            {lowConfidence ? (
              <span
                title="AI bu satırdan emin değil — lütfen manuel doğrulayın"
                aria-label="Düşük güven skoru"
                className="text-[10px] uppercase tracking-wider text-accent"
              >
                düşük
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
            {savingField ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                kaydediliyor
              </span>
            ) : isEdited ? (
              <span className="inline-flex items-center gap-1 text-primary">
                <Pencil className="h-3 w-3" aria-hidden />
                düzenlendi
              </span>
            ) : (
              <span>orijinal</span>
            )}
            {errorField ? (
              <span className="inline-flex items-center gap-1 text-accent">
                <X className="h-3 w-3" aria-hidden />
                hata
              </span>
            ) : null}
          </div>
        </div>
      </td>
    </tr>
  );
}