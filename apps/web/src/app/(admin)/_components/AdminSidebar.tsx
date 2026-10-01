"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UtensilsCrossed,
  Building2,
  Palette,
  QrCode,
  BarChart3,
  FileUp,
  Receipt,
  ChefHat,
  Users,
  Award,
  Banknote,
  Image as ImageIcon,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sprint 4B+ — disabled until that page ships. */
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/menus", label: "Menüler", icon: UtensilsCrossed },
  { href: "/admin/orders", label: "Siparişler", icon: Receipt },
  { href: "/admin/customers", label: "Müşteriler", icon: Users },
  { href: "/admin/kitchen", label: "Mutfak", icon: ChefHat },
  { href: "/admin/qr-codes", label: "QR Kodlar", icon: QrCode },
  { href: "/admin/pdf-import", label: "PDF Import", icon: FileUp },
  { href: "/admin/loyalty", label: "Sadakat", icon: Award },
  { href: "/admin/billing", label: "Plan & Limitler", icon: Banknote },
  { href: "/admin/analytics", label: "Analitik", icon: BarChart3 },
  { href: "/admin/business", label: "İşletme", icon: Building2 },
  { href: "/admin/media", label: "Medya Kütüphanesi", icon: ImageIcon },
  { href: "/admin/theme", label: "Tema", icon: Palette },
];

interface AdminSidebarProps {
  /** Display name for the sidebar brand area. Falls back to slug if missing. */
  businessName: string;
  /** Logout form action — server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

/**
 * AdminSidebar — left rail with brand + primary nav + logout.
 *
 * Velouté Hospitality Suite polish (D-035 / Sprint G):
 *   • 240px width with rounded-md brand mark, Playfair Display name.
 *   • Active nav item: solid `bg-primary text-primary-foreground` for
 *     clear contrast (was `bg-primary/10 text-primary`).
 *   • Inactive items: `text-text hover:bg-[var(--color-surface-low)]`.
 *   • Bottom logout card uses terracotta accent on hover.
 *   • All borders moved to `--color-border` for consistent hairline
 *     edges with the public-side polish.
 */
export function AdminSidebar({ businessName, logoutAction }: AdminSidebarProps) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--color-border)] bg-surface md:flex">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-4">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
        >
          {businessName.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p
            className="truncate font-heading text-sm font-semibold text-text"
            title={businessName}
          >
            {businessName}
          </p>
          <p className="font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-secondary">
            Admin Paneli
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Admin navigasyonu">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/admin/dashboard" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.comingSoon ? "#" : item.href}
              aria-disabled={item.comingSoon || undefined}
              tabIndex={item.comingSoon ? -1 : undefined}
              className={clsx(
                "group flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-text hover:bg-[var(--color-surface-low)] hover:text-primary",
                item.comingSoon &&
                  "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {item.comingSoon ? (
                <span className="rounded-pill bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  yakında
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="border-t border-[var(--color-border)] p-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-text transition hover:bg-secondary/10 hover:text-secondary"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            <span>Çıkış yap</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
