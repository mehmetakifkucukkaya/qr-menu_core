"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { canAccessAdminPath, landingPathFor, type UiRole } from "@/lib/roles";
import { NoPermission } from "./NoPermission";

/**
 * Swaps a page the role may not open for the polite "no permission" notice.
 *
 * The layout already refuses on a full page load (it knows the URL from
 * middleware); this covers soft navigations, where Next keeps the layout and
 * only replaces the page. The server answers 403 for the same requests either
 * way - this only decides what the person sees.
 */
export function AdminRoleGuard({ role, children }: { role: UiRole; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname === "" || canAccessAdminPath(role, pathname)) return <>{children}</>;
  return <NoPermission landingHref={landingPathFor(role)} />;
}
