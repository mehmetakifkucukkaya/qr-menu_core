interface AdminEmptyStateProps {
  title: string;
  message?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

/**
 * AdminEmptyState — used by dashboard cards, menus list, categories list,
 * etc. when the tenant has no data yet. Centered card with optional
 * CTA slot (e.g. "İlk menünü oluştur").
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
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center"
    >
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <p className="font-heading text-lg font-semibold text-text">{title}</p>
      {message ? (
        <p className="mt-2 max-w-md text-sm text-muted">{message}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
