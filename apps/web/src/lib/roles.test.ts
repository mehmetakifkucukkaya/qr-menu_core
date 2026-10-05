/**
 * Unit tests for `lib/roles.ts` - the UI mirror of the server's role table.
 *
 * Run via: cd apps/web && npm run test:roles
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  canAccessAdminPath,
  filterNavGroups,
  landingPathFor,
  uiRole,
  type UiRole,
} from "./roles.ts";

test("membership roles map to the UI role; the agency acts as owner", () => {
  assert.equal(uiRole("owner", false), "owner");
  assert.equal(uiRole("agency_admin", false), "owner");
  assert.equal(uiRole("manager", false), "manager");
  assert.equal(uiRole("staff", false), "staff");
  assert.equal(uiRole("kitchen", false), "kitchen");
  assert.equal(uiRole(null, true), "owner", "platform admin without a membership");
  assert.equal(uiRole(undefined, true), "owner");
  assert.equal(uiRole(null, false), null, "tied to no business: nothing to show");
  assert.equal(uiRole("wizard", false), null);
});

test("an explicit membership role beats the platform-admin flag", () => {
  assert.equal(uiRole("staff", true), "staff");
});

const MATRIX: Array<[string, UiRole[]]> = [
  ["/admin/dashboard", ["owner", "manager"]],
  ["/admin/orders", ["owner", "manager", "staff"]],
  ["/admin/orders/12", ["owner", "manager", "staff"]],
  ["/admin/kitchen", ["owner", "manager", "staff", "kitchen"]],
  ["/admin/availability", ["owner", "manager", "staff"]],
  ["/admin/menus", ["owner", "manager"]],
  ["/admin/menus/1/categories/2/items/new", ["owner", "manager"]],
  ["/admin/qr-codes/3/edit", ["owner", "manager"]],
  ["/admin/customers", ["owner", "manager"]],
  ["/admin/analytics", ["owner", "manager"]],
  ["/admin/theme", ["owner", "manager"]],
  ["/admin/team", ["owner"]],
  ["/admin/business", ["owner"]],
  ["/admin/billing", ["owner"]],
  ["/admin/account/password", ["owner", "manager", "staff", "kitchen"]],
];

for (const [path, allowed] of MATRIX) {
  test(`access to ${path}`, () => {
    for (const role of ["owner", "manager", "staff", "kitchen"] as const) {
      assert.equal(canAccessAdminPath(role, path), allowed.includes(role), `${role} ${path}`);
    }
  });
}

test("the /admin index is open to everyone (it only redirects)", () => {
  for (const role of ["owner", "manager", "staff", "kitchen"] as const) {
    assert.equal(canAccessAdminPath(role, "/admin"), true);
    assert.equal(canAccessAdminPath(role, "/admin/"), true);
  }
});

test("a page nobody classified is owner + manager, like the server fallback", () => {
  assert.equal(canAccessAdminPath("owner", "/admin/brand-new"), true);
  assert.equal(canAccessAdminPath("manager", "/admin/brand-new"), true);
  assert.equal(canAccessAdminPath("staff", "/admin/brand-new"), false);
  assert.equal(canAccessAdminPath("kitchen", "/admin/brand-new"), false);
});

test("query strings, hashes and trailing slashes do not change the answer", () => {
  assert.equal(canAccessAdminPath("kitchen", "/admin/kitchen?status=all"), true);
  assert.equal(canAccessAdminPath("kitchen", "/admin/kitchen/#x"), true);
  assert.equal(canAccessAdminPath("staff", "/admin/team/?x=1"), false);
});

test("a prefix match needs a path boundary", () => {
  assert.equal(canAccessAdminPath("kitchen", "/admin/kitchens"), false);
  assert.equal(canAccessAdminPath("staff", "/admin/ordersx"), false);
});

test("landing pages", () => {
  assert.equal(landingPathFor("owner"), "/admin/dashboard");
  assert.equal(landingPathFor("manager"), "/admin/dashboard");
  assert.equal(landingPathFor("staff"), "/admin/orders");
  assert.equal(landingPathFor("kitchen"), "/admin/kitchen");
});

test("every landing page is reachable by its own role", () => {
  for (const role of ["owner", "manager", "staff", "kitchen"] as const) {
    assert.equal(canAccessAdminPath(role, landingPathFor(role)), true, role);
  }
});

test("navigation is filtered per role and empty groups disappear", () => {
  const groups = [
    { label: "Operasyon", items: [{ href: "/admin/orders" }, { href: "/admin/kitchen" }] },
    { label: "Katalog", items: [{ href: "/admin/menus" }, { href: "/admin/availability" }] },
    { label: "Hesap", items: [{ href: "/admin/business" }, { href: "/admin/team" }] },
  ];
  const hrefs = (role: UiRole) =>
    filterNavGroups(groups, role).map((g) => g.items.map((i) => i.href));

  assert.deepEqual(hrefs("owner"), [
    ["/admin/orders", "/admin/kitchen"],
    ["/admin/menus", "/admin/availability"],
    ["/admin/business", "/admin/team"],
  ]);
  assert.deepEqual(hrefs("staff"), [["/admin/orders", "/admin/kitchen"], ["/admin/availability"]]);
  assert.deepEqual(hrefs("kitchen"), [["/admin/kitchen"]]);
  assert.deepEqual(
    filterNavGroups(groups, "kitchen").map((g) => g.label),
    ["Operasyon"],
  );
});
