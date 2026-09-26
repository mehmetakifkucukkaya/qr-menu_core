"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { CurrentUser } from "@/types/admin";

interface AdminHeaderProps {
  user: CurrentUser;
  /** Logout form action — server-issued POST. */
  logoutAction: (formData: FormData) => void;
}

/**
 * Build a human-readable label for a path segment (e.g. "menus" → "Menüler").
 * The mapping for the most common admin sections lives here; anything
 * unmapped gets humanized via simple capitalization.
 */
function humanizeSegment(segment: string): string {
  const map: Record<string, string> = {
    dashboard: "Dashboard",
    menus: "Menüler",
    business: "İşletme",
    theme: "Tema",
    admin: "Yönetim",
  };
  return map[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

function buildBreadcrumbs(pathname: string): { label: string; href: string }[] {
  if (!pathname || pathname === "/") return [];
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; href: string }[] = [];
  let acc = "";
  for (const part of parts) {
    acc += `/${part}`;
    crumbs.push({ label: humanizeSegment(part), href: acc });
  }
  return crumbs;
}

/**
 * AdminHeader — top bar with breadcrumb (left) + user info (right).
 * Logout lives in the sidebar; the header shows the email and a compact
 * menu so the user always knows which account is signed in.
 */
export function AdminHeader({ user, logoutAction }: AdminHeaderProps) {
  const pathname = usePathname() ?? "";
  const crumbs = buildBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          {crumbs.length > 0 ? (
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
              {crumbs.map((crumb, idx) => {
                const isLast = idx === crumbs.length - 1;
                return (
                  <li key={crumb.href} className="flex items-center gap-1">
                    {isLast ? (
                      <span className="font-medium text-text">{crumb.label}</span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className="rounded px-1 hover:text-primary"
                      >
                        {crumb.label}
                      </Link>
                    )}
                    {!isLast ? (
                      <ChevronRight
                        className="h-3.5 w-3.5 text-muted/60"
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

        {/* User menu */}
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-text" title={user.email}>
              {user.full_name || user.email}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-muted">
              {user.role}
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          >
            {(user.full_name || user.email).charAt(0).toUpperCase()}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-text transition hover:bg-accent/10 hover:text-accent"
            >
              Çıkış
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
