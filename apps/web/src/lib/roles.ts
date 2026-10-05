/**
 * Roles in the admin UI - the client-side mirror of backend/apps/accounts/roles.py.
 *
 * The server is the authority: RoleGateMiddleware answers 403 for anything a
 * role may not do, whatever this file says. This file only decides what to
 * SHOW - which links, which pages, where to land after signing in - so nobody
 * is offered a page that would only answer "forbidden".
 *
 * Keep `ACCESS` in step with the matrix in SPEC_PILOT_READINESS 3.1.
 */

export type UiRole = "owner" | "manager" | "staff" | "kitchen";

export const ROLE_LABELS: Readonly<Record<UiRole, string>> = {
  owner: "Sahip",
  manager: "Yönetici",
  staff: "Personel",
  kitchen: "Mutfak",
};

const ALL: readonly UiRole[] = ["owner", "manager", "staff", "kitchen"];
const OWNER_MANAGER_STAFF: readonly UiRole[] = ["owner", "manager", "staff"];
const OWNER_MANAGER: readonly UiRole[] = ["owner", "manager"];
const OWNER_ONLY: readonly UiRole[] = ["owner"];

/**
 * The role the UI behaves as. An `agency_admin` membership acts as owner, and
 * so does a platform admin (the agency), who may have no membership at all.
 * `null` = nobody we can show anything to (not tied to any business).
 */
export function uiRole(
  membershipRole: string | null | undefined,
  isPlatformAdmin: boolean,
): UiRole | null {
  switch (membershipRole) {
    case "owner":
    case "agency_admin":
      return "owner";
    case "manager":
    case "staff":
    case "kitchen":
      return membershipRole;
    default:
      return isPlatformAdmin ? "owner" : null;
  }
}

interface AccessRule {
  prefix: string;
  roles: readonly UiRole[];
}

/** First match wins. A path no rule names is owner + manager, like the server. */
const ACCESS: readonly AccessRule[] = [
  { prefix: "/admin/account", roles: ALL }, // change your own password
  { prefix: "/admin/kitchen", roles: ALL },
  { prefix: "/admin/orders", roles: OWNER_MANAGER_STAFF },
  { prefix: "/admin/availability", roles: OWNER_MANAGER_STAFF }, // "tükendi / mevcut"
  { prefix: "/admin/team", roles: OWNER_ONLY },
  { prefix: "/admin/business", roles: OWNER_ONLY },
  { prefix: "/admin/billing", roles: OWNER_ONLY },
  { prefix: "/admin/dashboard", roles: OWNER_MANAGER },
  { prefix: "/admin/menus", roles: OWNER_MANAGER },
  { prefix: "/admin/qr-codes", roles: OWNER_MANAGER },
  { prefix: "/admin/pdf-import", roles: OWNER_MANAGER },
  { prefix: "/admin/media", roles: OWNER_MANAGER },
  { prefix: "/admin/customers", roles: OWNER_MANAGER },
  { prefix: "/admin/loyalty", roles: OWNER_MANAGER },
  { prefix: "/admin/analytics", roles: OWNER_MANAGER },
  { prefix: "/admin/theme", roles: OWNER_MANAGER },
];

function cleanPath(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? "";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

/** Whether `role` may open the admin page at `pathname`. */
export function canAccessAdminPath(role: UiRole, pathname: string): boolean {
  const path = cleanPath(pathname);
  if (path === "/admin") return true; // the index only redirects to a landing page
  const rule = ACCESS.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`));
  return (rule ? rule.roles : OWNER_MANAGER).includes(role);
}

/** Where a role starts after signing in (and where "/admin" sends it). */
export function landingPathFor(role: UiRole): string {
  if (role === "kitchen") return "/admin/kitchen";
  if (role === "staff") return "/admin/orders";
  return "/admin/dashboard";
}

/** Drop the navigation links - and the groups left empty - a role cannot open. */
export function filterNavGroups<I extends { href: string }, G extends { items: I[] }>(
  groups: readonly G[],
  role: UiRole,
): G[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessAdminPath(role, item.href)),
    }))
    .filter((group) => group.items.length > 0);
}
