"use client";

import { useMemo } from "react";
import { ArrowRight, Info, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";

import { useSignupWizard } from "@/lib/stores/signup-wizard";

const ITEM_NAME_MAX = 80;
const ITEM_DESC_MAX = 240;
const MAX_ITEMS = 5;
const MIN_ITEMS = 1;

/**
 * Step4FirstItems — wizard step 4.
 *
 * Lets the operator seed 1-5 menu items for the first category they
 * created in Step 3. Items live entirely in the zustand store until
 * Sprint C3's onboarding/complete/ endpoint POSTs them.
 *
 * Validation: at least one item with a non-empty name is required
 * before the user can advance. There's also a "skip" affordance for
 * operators who want to start with an empty menu (the wizard still
 * completes, they can fill items later from the admin UI).
 */
export function Step4FirstItems() {
  const items = useSignupWizard((s) => s.formData.first_items);
  const addItem = useSignupWizard((s) => s.addItem);
  const updateItem = useSignupWizard((s) => s.updateItem);
  const removeItem = useSignupWizard((s) => s.removeItem);
  const setStep = useSignupWizard((s) => s.setStep);

  const canAdvance = useMemo(() => {
    // At least one named item.
    return items.some((it) => it.name.trim().length > 0);
  }, [items]);

  function handleNext() {
    if (!canAdvance) return;
    setStep(5);
  }

  function handleSkip() {
    // Operator chooses to skip the items step entirely — items will
    // be empty when C3's onboarding endpoint runs, which is fine
    // (the backend treats first_items as optional).
    setStep(5);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-text">
              İlk ürünler
            </h2>
            <p className="mt-1 text-sm text-muted">
              İlk kategorinize 1-5 ürün ekleyin. Boş bırakırsanız
              sonra admin panelinden ekleyebilirsiniz.
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted"
            title="Sprint C3&apos;te backend&apos;e kaydedilecek"
          >
            <Info className="h-3 w-3" />
            Sprint C3&apos;te kaydedilecek
          </span>
        </div>
      </header>

      <div className="space-y-3">
        {items.map((item, index) => (
          <ItemRow
            key={index}
            index={index}
            name={item.name}
            price={item.price}
            description={item.description}
            canDelete={items.length > MIN_ITEMS}
            onNameChange={(v) => updateItem(index, { name: v })}
            onPriceChange={(v) => updateItem(index, { price: v })}
            onDescriptionChange={(v) => updateItem(index, { description: v })}
            onDelete={() => removeItem(index)}
          />
        ))}

        {items.length < MAX_ITEMS ? (
          <button
            type="button"
            onClick={addItem}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/40 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-primary/40 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus className="h-4 w-4" />
            Ürün ekle
          </button>
        ) : (
          <p className="text-center text-xs text-muted">
            En fazla {MAX_ITEMS} ürün ekleyebilirsiniz.
          </p>
        )}
      </div>

      {!canAdvance ? (
        <p className="text-xs text-danger" role="alert">
          En az bir ürünün adını yazmanız gerekiyor. İsterseniz &quot;Bu
          adımı atla&quot; ile boş başlayabilirsiniz.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setStep(3)}
          className="text-sm font-medium text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded px-2 py-1"
        >
          ← Geri
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-background hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            İlk kategori ve ürünleri sonra ekleyeceğim
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Devam et
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItemRow — single product draft row.
// ---------------------------------------------------------------------------

interface ItemRowProps {
  index: number;
  name: string;
  price: string;
  description: string;
  canDelete: boolean;
  onNameChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onDelete: () => void;
}

function ItemRow({
  index,
  name,
  price,
  description,
  canDelete,
  onNameChange,
  onPriceChange,
  onDescriptionChange,
  onDelete,
}: ItemRowProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Ürün {index + 1}
        </span>
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Ürün ${index + 1} sil`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label
            htmlFor={`item-name-${index}`}
            className="text-xs font-medium text-text"
          >
            Ürün adı
          </label>
          <input
            id={`item-name-${index}`}
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            maxLength={ITEM_NAME_MAX}
            placeholder="Örn. Türk Kahvesi"
            className="mt-1 w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          />
        </div>
        <div>
          <label
            htmlFor={`item-price-${index}`}
            className="text-xs font-medium text-text"
          >
            Fiyat
          </label>
          <input
            id={`item-price-${index}`}
            type="text"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            placeholder="0,00"
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          />
        </div>
      </div>
      <div className="mt-3">
        <label
          htmlFor={`item-desc-${index}`}
          className="text-xs font-medium text-text"
        >
          Açıklama (opsiyonel)
        </label>
        <textarea
          id={`item-desc-${index}`}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          maxLength={ITEM_DESC_MAX}
          rows={2}
          placeholder="Kısa açıklama…"
          className={clsx(
            "mt-1 w-full resize-y rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
          )}
        />
        <p className="mt-1 text-right text-[11px] text-muted">
          {description.length} / {ITEM_DESC_MAX}
        </p>
      </div>
    </div>
  );
}