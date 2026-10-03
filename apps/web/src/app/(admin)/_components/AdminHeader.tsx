"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Menu } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import type { CurrentUser } from "@/types/admin";
import { AdminNavList } from "./AdminNav";
import { AdminAccountLinks, AdminBrand } from "./AdminSidebarParts";

interface AdminHeaderProps {
  user: CurrentUser;
  businessName: string;
  businessLogo?: string | null;
  businessSlug?: string | null;
  /** Logout form action — server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

/** Turkish labels for the URL segments the admin uses. */
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Yönetim",
  dashboard: "Dashboard",
  menus: "Menüler",
  categories: "Kategoriler",
  items: "Ürünler",
  orders: "Siparişler",
  kitchen: "Mutfak",
  customers: "Müşteriler",
  "qr-codes": "QR Kodlar",
  "pdf-import": "PDF Import",
  drafts: "Taslaklar",
  media: "Medya Kütüphanesi",
  loyalty: "Sadakat",
  analytics: "Analitik",
  business: "İşletme",
  theme: "Tema",
  billing: "Plan & Limitler",
  translate: "Çeviri",
  new: "Yeni",
  edit: "Düzenle",
};

interface Crumb {
  label: string;
  href: string;
}

/**
 * Breadcrumb trail for the current URL. Numeric segments (record ids) are not
 * shown — "Menüler › 1 › Categories › 1 › Items" meant nothing to an owner —
 * but they stay in each crumb's link, so every crumb still goes to a real page.
 * Pages that know the record's name show it in their own in-page breadcrumb.
 */
function buildBreadcrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    if (/^\d+$/.test(part)) continue;
    crumbs.push({
      label:
        SEGMENT_LABELS[part] ?? part.charAt(0).toUpperCase() + part.slice(1),
      href: acc,
    });
  }
  return crumbs;
}

/**
 * AdminHeader — the sticky top bar.
 *
 * Phones: a menu button (opens the navigation drawer — the sidebar is hidden
 * there, which used to leave phone users with no way to move between sections)
 * and the current page's name.
 * md and up: the full breadcrumb trail, plus the signed-in user.
 */
export function AdminHeader({
  user,
  businessName,
  businessLogo,
  businessSlug,
  logoutAction,
}: AdminHeaderProps) {
  const pathname = usePathname() ?? "";
  const crumbs = buildBreadcrumbs(pathname);
  const current = crumbs[crumbs.length - 1];
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer once navigation has happened.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const displayName = user.full_name || user.email;

  return (
    <>
      <header className="glass sticky top-0 z-header border-b border-border/70">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 md:hidden"
            aria-label="Menüyü aç"
            aria-haspopup="dialog"
            onClick={() => setNavOpen(true)}
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>

          {/* Phones: just the page name. */}
          <p className="min-w-0 flex-1 truncate font-heading text-lg font-semibold text-text sm:hidden">
            {current?.label ?? "Admin"}
          </p>

          {/* Larger screens: the full trail. */}
          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 sm:block">
            {crumbs.length > 0 ? (
              <ol className="flex items-center gap-1 text-sm text-muted">
                {crumbs.map((crumb, idx) => {
                  const isLast = idx === crumbs.length - 1;
                  return (
                    <li
                      key={crumb.href}
                      className="flex min-w-0 items-center gap-1"
                    >
                      {isLast ? (
                        <span
                          aria-current="page"
                          className="truncate font-semibold text-text"
                        >
                          {crumb.label}
                        </span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="truncate rounded-md px-1 transition-colors hover:text-primary"
                        >
                          {crumb.label}
                        </Link>
                      )}
                      {!isLast ? (
                        <ChevronRight
                          className="h-3.5 w-3.5 shrink-0 text-outline"
                          aria-hidden
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <span className="text-sm text-muted">QR Menü · Admin</span>
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p
                className="max-w-[14rem] truncate text-sm font-medium text-text"
                title={user.email}
              >
                {displayName}
              </p>
              <p className="text-xs capitalize text-outline">{user.role}</p>
            </div>
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary ring-1 ring-primary/10"
            >
              {displayName.charAt(0).toLocaleUpperCase("tr-TR")}
            </span>
          </div>
        </div>
      </header>

      <Sheet
        open={navOpen}
        onClose={() => setNavOpen(false)}
        variant="left"
        ariaLabel="Admin menüsü"
        // The list is taller than a phone screen; the fade at the bottom shows
        // that it scrolls, and the bottom padding lets the last link clear it.
        bodyClassName="px-3 pb-10 pt-1 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
        headerSlot={
          <AdminBrand businessName={businessName} businessLogo={businessLogo} />
        }
        footer={
          <AdminAccountLinks
            businessSlug={businessSlug}
            logoutAction={logoutAction}
          />
        }
      >
        <AdminNavList onNavigate={() => setNavOpen(false)} />
      </Sheet>
    </>
  );
}
