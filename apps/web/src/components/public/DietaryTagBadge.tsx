import type { PublicMenuDietaryTag, LocaleCode, Translation } from "@/types/menu";
import { pickTranslation } from "@/types/menu";

interface DietaryTagBadgeProps {
  tag: PublicMenuDietaryTag;
  locale: LocaleCode;
  /** When true, render as a small chip (no icon). Default false. */
  compact?: boolean;
}

/**
 * DietaryTagBadge — vegan / vegetarian / gluten_free / etc.
 *
 * Uses the tag's `color` field from the backend as the chip accent.
 * Falls back to the primary brand color if the tag color isn't set.
 */
export function DietaryTagBadge({ tag, locale, compact }: DietaryTagBadgeProps) {
  const label = pickTranslation(tag.name as Translation, locale);
  const accent = tag.color || "#10B981";

  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1"
      style={{
        backgroundColor: `${accent}14`, // ~8% alpha
        color: accent,
        borderColor: `${accent}55`,
      }}
    >
      {!compact ? <span aria-hidden>{ICON_HINTS[tag.icon] ?? "🌿"}</span> : null}
      <span>{label}</span>
    </span>
  );
}

const ICON_HINTS: Record<string, string> = {
  leaf: "🌿",
  salad: "🥗",
  flame: "🔥",
  star: "⭐",
  sparkles: "✨",
  shield: "🛡️",
};