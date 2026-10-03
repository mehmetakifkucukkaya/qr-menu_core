import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";
import { ItemCard } from "./ItemCard";

interface CategorySectionProps {
  category: PublicMenuCategory;
  onItemSelect?: (item: PublicMenuItem) => void;
  allergenNames?: Record<string, string>;
}

/**
 * CategorySection — anchor target for the category chips / rail, plus the
 * section heading and its list of dishes.
 *
 * `id="category-{slug}"` makes direct hash links work; `useCategorySpy` reads
 * the same ids for the active-chip highlight. The landing offset under the
 * sticky header + chip row comes from `scroll-padding-top` on <html>
 * (globals.css), so no per-section scroll margin is needed.
 */
export function CategorySection({
  category,
  onItemSelect,
  allergenNames,
}: CategorySectionProps) {
  if (category.items.length === 0) return null;

  return (
    <section
      id={`category-${category.slug}`}
      data-category-anchor={category.slug}
      aria-labelledby={`category-${category.slug}-title`}
    >
      <header className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2
            id={`category-${category.slug}-title`}
            className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-[1.75rem]"
          >
            {category.name}
          </h2>
          {category.description ? (
            <p className="mt-1 line-clamp-2 max-w-prose text-sm text-muted">
              {category.description}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 pb-1 text-xs font-medium text-outline">
          {category.items.length} ürün
        </span>
      </header>
      <ul className="space-y-3">
        {category.items.map((item) => (
          <li key={item.id}>
            <ItemCard
              item={item}
              category={category}
              onSelect={onItemSelect}
              allergenNames={allergenNames}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
