import { AdminNavList } from "./AdminNav";
import { AdminAccountLinks, AdminBrand } from "./AdminSidebarParts";

interface AdminSidebarProps {
  /** Display name for the sidebar brand area. */
  businessName: string;
  businessLogo?: string | null;
  businessSlug?: string | null;
  /** Logout form action — server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

/**
 * AdminSidebar — the desktop left rail (hidden below `md`, where the header's
 * menu button opens the same navigation as a drawer).
 *
 * It is pinned to the viewport height (`sticky` + `h-screen`): the nav scrolls
 * on its own if it is ever taller than the screen, and the account links stay
 * in reach instead of sinking to the bottom of a long page.
 */
export function AdminSidebar({
  businessName,
  businessLogo,
  businessSlug,
  logoutAction,
}: AdminSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="px-4 pb-3 pt-5">
        <AdminBrand businessName={businessName} businessLogo={businessLogo} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <AdminNavList />
      </div>

      <div className="border-t border-border p-3">
        <AdminAccountLinks
          businessSlug={businessSlug}
          logoutAction={logoutAction}
        />
      </div>
    </aside>
  );
}
