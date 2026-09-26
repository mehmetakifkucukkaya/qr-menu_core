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
      className="rounded-lg border border-dashed border-border bg-surface p-8 text-center"
    >
      <p className="font-heading text-lg text-text">{title}</p>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </div>
  );
}