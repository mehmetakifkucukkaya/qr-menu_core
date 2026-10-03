import { UtensilsCrossed } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  message?: string;
}

/**
 * EmptyState — graceful degradation when the business has no published
 * items yet. Used by /m/[businessSlug]/page.tsx when categories is empty.
 */
export function EmptyState({
  title = "Henüz yayınlanmış ürün yok.",
  message = "İşletme sahibi menüyü yayınladığında burada görünecek.",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center rounded-3xl border border-dashed border-border-strong bg-surface px-6 py-12 text-center"
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
        <UtensilsCrossed className="h-7 w-7" aria-hidden />
      </span>
      <p className="font-heading text-xl font-semibold text-text">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {message}
      </p>
    </div>
  );
}
