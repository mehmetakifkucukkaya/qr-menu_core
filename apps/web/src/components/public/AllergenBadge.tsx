import type { PublicMenuAllergen, LocaleCode, Translation } from "@/types/menu";
import { pickTranslation } from "@/types/menu";

interface AllergenBadgeProps {
  allergen: PublicMenuAllergen;
  locale: LocaleCode;
}

/**
 * AllergenBadge — small chip for a single allergen. Used inside
 * ItemDetailDrawer; lightweight enough to also render in ItemCard
 * when density is acceptable.
 *
 * The icon is the `icon` slug from the backend (e.g. "wheat", "milk")
 * — for V1 we render an emoji fallback rather than wiring a full
 * icon library, keeping the bundle small.
 */
export function AllergenBadge({ allergen, locale }: AllergenBadgeProps) {
  const label = pickTranslation(allergen.name as Translation, locale);
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200"
    >
      <span aria-hidden>{ICON_HINTS[allergen.icon] ?? "⚠️"}</span>
      <span>{label}</span>
    </span>
  );
}

const ICON_HINTS: Record<string, string> = {
  wheat: "🌾",
  milk: "🥛",
  nut: "🥜",
  egg: "🥚",
  bean: "🫘",
  fish: "🐟",
  shell: "🦐",
  seed: "🌱",
};