"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Banknote,
  BarChart3,
  Building2,
  ChefHat,
  FileUp,
  Image as ImageIcon,
  LayoutDashboard,
  Palette,
  QrCode,
  Receipt,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  /** Section label; the first group (dashboard) has none. */
  label?: string;
  items: NavItem[];
}

/**
 * The admin's information architecture in one place. The desktop sidebar and
 * the phone drawer both render this list, so a new page is added once.
 *
 * The thirteen flat links were grouped by what the owner is doing — running
 * the day (orders, kitchen, customers), maintaining the catalogue, growing the
 * business, or configuring the account — so the list can be scanned instead
 * of read top to bottom.
 */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Operasyon",
    items: [
      { href: "/admin/orders", label: "Siparişler", icon: Receipt },
      { href: "/admin/kitchen", label: "Mutfak", icon: ChefHat },
      { href: "/admin/customers", label: "Müşteriler", icon: Users },
    ],
  },
  {
    label: "Katalog",
    items: [
      { href: "/admin/menus", label: "Menüler", icon: UtensilsCrossed },
      { href: "/admin/qr-codes", label: "QR Kodlar", icon: QrCode },
      { href: "/admin/pdf-import", label: "PDF Import", icon: FileUp },
      { href: "/admin/media", label: "Medya Kütüphanesi", icon: ImageIcon },
    ],
  },
  {
    label: "Büyüme",
    items: [
      { href: "/admin/loyalty", label: "Sadakat", icon: Award },
      { href: "/admin/analytics", label: "Analitik", icon: BarChart3 },
    ],
  },
  {
    label: "Hesap",
    items: [
      { href: "/admin/business", label: "İşletme", icon: Building2 },
      { href: "/admin/theme", label: "Tema", icon: Palette },
      { href: "/admin/billing", label: "Plan & Limitler", icon: Banknote },
    ],
  },
];

interface AdminNavListProps {
  /** Called after a link is chosen (the phone drawer closes itself). */
  onNavigate?: () => void;
}

/**
 * AdminNavList — grouped navigation links with the current section marked.
 * A section counts as current for its own URL and everything beneath it
 * (`/admin/menus/1/edit` keeps "Menüler" highlighted).
 */
export function AdminNavList({ onNavigate }: AdminNavListProps) {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Admin navigasyonu" className="flex flex-col gap-0.5">
      {ADMIN_NAV_GROUPS.map((group, index) => (
        <div key={group.label ?? index} className={group.label ? "pt-4" : undefined}>
          {group.label ? (
            <p className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-outline">
              {group.label}
            </p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/admin/dashboard" &&
                  pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={clsx(
                      "group flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors duration-200",
                      isActive
                        ? "bg-primary-soft font-semibold text-primary"
                        : "font-medium text-muted hover:bg-surface-low hover:text-text",
                    )}
                  >
                    <Icon
                      className={clsx(
                        "h-[1.125rem] w-[1.125rem] shrink-0 transition-colors duration-200",
                        isActive
                          ? "text-primary"
                          : "text-outline group-hover:text-text",
                      )}
                      aria-hidden
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
