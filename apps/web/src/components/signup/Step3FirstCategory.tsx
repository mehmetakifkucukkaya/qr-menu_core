"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Info } from "lucide-react";
import clsx from "clsx";

import { useSignupWizard } from "@/lib/stores/signup-wizard";

// ---------------------------------------------------------------------------
// Category icon presets — small emoji shortlist that covers the most common
// cafe / restaurant categories. Keeps the dropdown light without locking
// out custom emojis (the user can paste any emoji they want into the
// input).
// ---------------------------------------------------------------------------

const ICON_PRESETS: readonly string[] = [
  "🍽️",
  "☕",
  "🍕",
  "🍔",
  "🥗",
  "🍝",
  "🍰",
  "🥤",
  "🍷",
  "🍳",
  "🥖",
  "🍣",
];

const CATEGORY_NAME_MAX = 60;

/**
 * Step3FirstCategory — wizard step 3.
 *
 * Captures the operator's first category (name + icon + sort order).
 * The data lives entirely in the zustand store; Sprint C3's
 * onboarding/complete/ endpoint will POST it to the backend.
 *
 * Right now this step is a UI scaffold — the form renders, the user
 * can advance, but the badge under the title makes it explicit that
 * the data is held locally until C3 ships.
 */
export function Step3FirstCategory() {
  const form = useSignupWizard((s) => s.formData);
  const updateCategory = useSignupWizard((s) => s.updateCategory);
  const setStep = useSignupWizard((s) => s.setStep);

  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form.first_category.name.trim()) {
      errors.name = "Kategori adı zorunlu.";
    } else if (form.first_category.name.trim().length > CATEGORY_NAME_MAX) {
      errors.name = `En fazla ${CATEGORY_NAME_MAX} karakter olabilir.`;
    }
    return errors;
  }, [form.first_category.name]);

  const hasErrors = Object.keys(validation).length > 0;

  function handleNext() {
    if (hasErrors) return;
    setStep(4);
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-text">
              İlk kategori
            </h2>
            <p className="mt-1 text-sm text-muted">
              Menünüzün ilk kategorisini oluşturun. Sonraki adımda
              ürünleri ekleyeceğiz.
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

      <div>
        <label
          htmlFor="signup-category-name"
          className="text-sm font-medium text-text"
        >
          Kategori adı
          <span aria-hidden className="ml-0.5 text-accent">*</span>
        </label>
        <input
          id="signup-category-name"
          name="category_name"
          type="text"
          value={form.first_category.name}
          onChange={(e) => updateCategory({ name: e.target.value })}
          maxLength={CATEGORY_NAME_MAX}
          required
          placeholder="Örn. Kahvaltı, Sıcak İçecekler, Pizzalar…"
          aria-invalid={validation.name ? "true" : undefined}
          aria-describedby={validation.name ? "category-name-error" : undefined}
          className={clsx(
            "mt-1.5 w-full rounded-md border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:ring-2",
            validation.name
              ? "border-accent focus:border-accent focus:ring-accent/30"
              : "border-border focus:border-primary focus:ring-primary/30",
          )}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-muted">
          <span>
            {form.first_category.name.length} / {CATEGORY_NAME_MAX}
          </span>
          {validation.name ? (
            <span id="category-name-error" role="alert" className="font-medium text-accent">
              {validation.name}
            </span>
          ) : null}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-text">İkon</span>
        <p className="mt-0.5 text-xs text-muted">
          Menü listesinde kategori adının yanında görünür.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIconPickerOpen((v) => !v)}
            aria-expanded={iconPickerOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden>{form.first_category.icon || "🍽️"}</span>
          </button>
          <input
            type="text"
            value={form.first_category.icon}
            onChange={(e) => updateCategory({ icon: e.target.value })}
            placeholder="emoji"
            aria-label="Kategori ikonu"
            className="w-20 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            maxLength={4}
          />
          <span className="text-xs text-muted">
            İsterseniz emoji&apos;i doğrudan yapıştırabilirsiniz.
          </span>
        </div>
        {iconPickerOpen ? (
          <div className="mt-2 grid grid-cols-6 gap-2 rounded-md border border-border bg-background/60 p-2 sm:grid-cols-12">
            {ICON_PRESETS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  updateCategory({ icon: emoji });
                  setIconPickerOpen(false);
                }}
                className={clsx(
                  "flex h-9 w-9 items-center justify-center rounded text-lg transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  form.first_category.icon === emoji
                    ? "bg-primary/10 ring-1 ring-primary"
                    : "",
                )}
                aria-label={`İkon ${emoji}`}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="signup-category-order"
          className="text-sm font-medium text-text"
        >
          Sıralama
        </label>
        <input
          id="signup-category-order"
          name="category_order"
          type="number"
          min={0}
          step={1}
          value={form.first_category.order}
          onChange={(e) =>
            updateCategory({ order: Number.parseInt(e.target.value, 10) || 0 })
          }
          className="mt-1.5 w-24 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <p className="mt-1 text-xs text-muted">
          Düşük sayılar menüde önce görünür.
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="text-sm font-medium text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded px-2 py-1"
        >
          ← Geri
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={hasErrors}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Devam et
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}