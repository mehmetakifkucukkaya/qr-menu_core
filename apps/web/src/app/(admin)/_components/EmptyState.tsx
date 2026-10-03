interface AdminEmptyStateProps {
  title: string;
  message?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * AdminEmptyState — used by dashboard cards, menus list, categories list,
 * etc. when the tenant has no data yet. A dashed, quiet card with an optional
 * icon and a CTA slot (e.g. "İlk menünü oluştur").
 */
export function AdminEmptyState({
  title,
  message,
  action,
  icon,
}: AdminEmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center"
    >
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          {icon}
        </div>
      ) : null}
      <p className="font-heading text-lg font-semibold text-text">{title}</p>
      {message ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
          {message}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
