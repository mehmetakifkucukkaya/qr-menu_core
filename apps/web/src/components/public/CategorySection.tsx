import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";
import { ItemCard } from "./ItemCard";

interface CategorySectionProps {
  category: PublicMenuCategory;
  onItemSelect?: (item: PublicMenuItem) => void;
}

/**
 * CategorySection — anchor target for CategoryNav + heading + items grid.
 *
 * The `data-category-anchor` attribute is what CategoryNav's
 * IntersectionObserver watches (see CategoryNav.tsx). The section id
 * is `#category-{slug}` so direct hash links also work.
 */
export function CategorySection({ category, onItemSelect }: CategorySectionProps) {
  if (category.items.length === 0) return null;

  return (
    <section
      id={`category-${category.slug}`}
      data-category-anchor={category.slug}
      aria-labelledby={`category-${category.slug}-title`}
      className="scroll-mt-16"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h2
          id={`category-${category.slug}-title`}
          className="font-heading text-xl font-semibold text-text sm:text-2xl"
        >
          {category.name}
        </h2>
        <span className="text-xs text-muted">
          {category.items.length} ürün
        </span>
      </header>
      {category.description ? (
        <p className="mb-4 text-sm text-muted">{category.description}</p>
      ) : null}
      <ul className="space-y-3">
        {category.items.map((item) => (
          <li key={item.id}>
            <ItemCard item={item} category={category} onSelect={onItemSelect} />
          </li>
        ))}
      </ul>
    </section>
  );
}