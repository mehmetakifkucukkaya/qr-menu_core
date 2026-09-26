"use client";

import clsx from "clsx";

import type { AdminLocaleCode, DietaryTag } from "@/types/admin";

interface DietaryTagSelectorProps {
  /** Available tags (from /api/v1/admin/dietary-tags/). */
  tags: DietaryTag[];
  /** Selected tag IDs. */
  value: number[];
  /** Called when the selection changes. */
  onChange: (next: number[]) => void;
  /** Locale used to resolve `tag.name.tr/.en`. */
  locale: AdminLocaleCode;
  /** Optional disabled state. */
  disabled?: boolean;
}

const EMOJI_FALLBACK: Record<string, string> = {
  vegan: "🌱",
  vegetarian: "🥗",
  gluten_free: "🚫🌾",
  halal: "☪️",
  kosher: "✡️",
  organic: "🍃",
};

function pickName(t: DietaryTag, locale: AdminLocaleCode): string {
  const n = t.name;
  if (!n) return t.code;
  return (
    (locale === "tr" ? n.tr : n.en) ??
    (locale === "tr" ? n.en : n.tr) ??
    t.code
  );
}

/**
 * DietaryTagSelector — multi-select chips with a per-tag color from the
 * backend (`tag.color` is a hex string). Used by MenuItem create/edit.
 *
 * Color is rendered as a left border + soft tinted background so we don't
 * blast the user with a saturated palette. The icon hint falls back to
 * an emoji (V1 keeps the icon library small).
 */
export function DietaryTagSelector({
  tags,
  value,
  onChange,
  locale,
  disabled = false,
}: DietaryTagSelectorProps) {
  const toggle = (id: number) => {
    if (disabled) return;
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  if (tags.length === 0) {
    return (
      <p className="text-xs italic text-muted">
        Aktif diyet etiketi tanımı bulunamadı.
      </p>
    );
  }

  return (
    <div role="group" aria-label="Diyet etiketi seçimi" className="flex flex-wrap gap-2">
      {tags.map((t) => {
        const selected = value.includes(t.id);
        const label = pickName(t, locale);
        const color = t.color || "#10B981";
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            disabled={disabled}
            aria-pressed={selected}
            style={
              selected
                ? {
                    backgroundColor: `${color}22`, // 13% alpha tint
                    borderColor: color,
                    color: color,
                  }
                : undefined
            }
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
              !selected && "hover:bg-background",
            )}
          >
            <span aria-hidden>{EMOJI_FALLBACK[t.icon] ?? "🏷️"}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
