"use client";

import clsx from "clsx";

import type { AdminLocaleCode, Allergen } from "@/types/admin";

interface AllergenSelectorProps {
  /** Available allergens (from /api/v1/admin/allergens/). */
  allergens: Allergen[];
  /** Selected allergen IDs. */
  value: number[];
  /** Called when the selection changes. */
  onChange: (next: number[]) => void;
  /** Locale used to resolve `allergen.name.tr/.en`. */
  locale: AdminLocaleCode;
  /** Optional disabled state. */
  disabled?: boolean;
}

const EMOJI_FALLBACK: Record<string, string> = {
  wheat: "🌾",
  milk: "🥛",
  nut: "🥜",
  egg: "🥚",
  bean: "🫘",
  fish: "🐟",
  shell: "🦐",
  seed: "🌱",
};

function pickName(a: Allergen, locale: AdminLocaleCode): string {
  const n = a.name;
  if (!n) return a.code;
  return (
    (locale === "tr" ? n.tr : n.en) ??
    (locale === "tr" ? n.en : n.tr) ??
    a.code
  );
}

/**
 * AllergenSelector — multi-select chips for an item's allergen tags.
 *
 * The backend expects an array of allergen IDs in `allergen_ids`. We render
 * each chip as a toggle button with the locale-resolved label and a
 * lucide/emoji icon hint (V1 keeps the icon hint as an emoji to avoid
 * shipping a full icon library just for this).
 *
 * Used by:
 *   - MenuItem create/edit form
 */
export function AllergenSelector({
  allergens,
  value,
  onChange,
  locale,
  disabled = false,
}: AllergenSelectorProps) {
  const toggle = (id: number) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  if (allergens.length === 0) {
    return (
      <p className="text-xs italic text-muted">
        Aktif alerjen tanımı bulunamadı.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label="Alerjen seçimi"
      className="flex flex-wrap gap-2"
    >
      {allergens.map((a) => {
        const selected = value.includes(a.id);
        const label = pickName(a, locale);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => toggle(a.id)}
            disabled={disabled}
            aria-pressed={selected}
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
              selected
                ? "border-warning/30 bg-warning-soft text-warning"
                : "border-border bg-surface text-muted hover:border-warning/30 hover:bg-warning/10",
            )}
          >
            <span aria-hidden>{EMOJI_FALLBACK[a.icon] ?? "⚠️"}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
