import { API_ORIGIN, expect, loginAsAdmin, test } from "./support";
import type { Browser, Page } from "@playwright/test";

/**
 * Flow 9 - roles and the team (SPEC_PILOT_READINESS 2 steps 2-3 and 8).
 *
 * The owner adds a kitchen user and a floor-staff user from the Ekip page,
 * each signs in with the temporary password, is made to choose a new one and
 * lands on their own page; neither can open or call what their role may not;
 * deactivating a member ends their access at once.
 *
 * The seeded demo account is a platform admin with an OWNER membership - it
 * stands in for the owner here. (A plain owner is covered by the backend
 * tests: apps/organizations/tests/test_owner_profile.py.)
 */

const stamp = Date.now();
const KITCHEN_EMAIL = `mutfak-${stamp}@modern-cafe.local`;
const STAFF_EMAIL = `personel-${stamp}@modern-cafe.local`;
const NEW_PASSWORD = "Yepyeni-Sifre-2026!";

const passwords: Record<string, string> = {};

async function addMember(page: Page, fullName: string, email: string, role: "kitchen" | "staff") {
  await page.goto("/admin/team");
  await page.getByRole("button", { name: "Üye ekle" }).click();
  await page.getByLabel(/^Ad soyad/).fill(fullName);
  await page.getByLabel(/^E-posta/).fill(email);
  await page.getByLabel("Rol", { exact: true }).selectOption(role);
  await page.getByRole("button", { name: "Üyeyi ekle" }).click();

  const shown = page.getByTestId("temporary-password");
  await expect(shown).toBeVisible();
  const password = ((await shown.textContent()) ?? "").trim();
  expect(password).toMatch(/^[A-Za-z0-9]{10}$/);
  passwords[email] = password;
  await page.getByRole("button", { name: "Tamam, not aldım" }).click();
  await expect(page.getByRole("cell", { name: new RegExp(email) })).toBeVisible();
}

/** Sign in as a team member in a fresh browser context and get past the forced password change. */
async function signInAndChoosePassword(browser: Browser, email: string, landing: RegExp) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(email);
  await page.getByLabel(/^Şifre/).fill(passwords[email]);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  // A temporary password has to be replaced before anything else is reachable.
  await expect(page.getByRole("heading", { name: "Şifrenizi belirleyin" })).toBeVisible();
  await page.getByLabel(/^Mevcut şifre/).fill(passwords[email]);
  await page.getByLabel(/^Yeni şifre\*?$/).fill(NEW_PASSWORD);
  await page.getByLabel(/^Yeni şifre \(tekrar\)/).fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Şifreyi değiştir" }).click();

  await expect(page).toHaveURL(landing);
  return { context, page };
}

async function csrfCookie(page: Page): Promise<string> {
  const cookie = (await page.context().cookies()).find((c) => c.name === "qr_csrftoken");
  expect(cookie, "the CSRF cookie of the signed-in session").toBeTruthy();
  return cookie!.value;
}

test.describe.serial("roles and team", () => {
  test("/admin is the front door, not a 404", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
  });

  test("the owner adds a kitchen user and a staff user", async ({ page }) => {
    await loginAsAdmin(page);
    await addMember(page, "E2E Mutfak", KITCHEN_EMAIL, "kitchen");
    await addMember(page, "E2E Personel", STAFF_EMAIL, "staff");
    // Both are listed as active, still on a temporary password.
    const row = page.getByRole("row", { name: new RegExp(KITCHEN_EMAIL) });
    await expect(row.getByText("Aktif")).toBeVisible();
    await expect(row.getByText("Geçici şifre")).toBeVisible();
  });

  test("the kitchen user: forced password change, kitchen only, server refuses the rest", async ({
    browser,
  }) => {
    const { context, page } = await signInAndChoosePassword(browser, KITCHEN_EMAIL, /\/admin\/kitchen$/);

    const nav = page.getByRole("navigation", { name: "Admin navigasyonu" });
    await expect(nav.getByRole("link", { name: "Mutfak" })).toBeVisible();
    for (const hidden of ["Menüler", "Siparişler", "Ekip", "Plan & Limitler", "Müşteriler"]) {
      await expect(nav.getByRole("link", { name: hidden })).toHaveCount(0);
    }

    // A page this role may not open becomes a polite notice...
    await page.goto("/admin/menus");
    await expect(page.getByRole("heading", { name: "Bu sayfaya yetkiniz yok" })).toBeVisible();

    // ...and the server refuses the same thing independently of the UI.
    const refused = await page.request.get(`${API_ORIGIN}/api/v1/admin/menus/`);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe("auth.role_forbidden");

    // The one thing it is for works.
    expect((await page.request.get(`${API_ORIGIN}/api/v1/admin/kitchen/tickets`)).status()).toBe(200);
    await context.close();
  });

  test("the staff user: orders and 'tükendi', no menu editing, no team", async ({ browser }) => {
    const { context, page } = await signInAndChoosePassword(browser, STAFF_EMAIL, /\/admin\/orders$/);

    const nav = page.getByRole("navigation", { name: "Admin navigasyonu" });
    for (const visible of ["Siparişler", "Mutfak", "Ürün durumu"]) {
      await expect(nav.getByRole("link", { name: visible })).toBeVisible();
    }
    for (const hidden of ["Menüler", "Ekip", "Plan & Limitler", "Dashboard"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }

    // Mark a dish as sold out, then bring it back.
    await page.goto("/admin/availability");
    await page.getByRole("button", { name: "Türk Kahvesi: tükendi yap" }).click();
    await expect(page.getByRole("button", { name: "Türk Kahvesi: mevcut yap" })).toBeVisible();
    await page.getByRole("button", { name: "Türk Kahvesi: mevcut yap" }).click();
    await expect(page.getByRole("button", { name: "Türk Kahvesi: tükendi yap" })).toBeVisible();

    // The server: reading the menu is allowed, deleting and the team are not.
    expect((await page.request.get(`${API_ORIGIN}/api/v1/admin/menus/`)).status()).toBe(200);
    const csrf = await csrfCookie(page);
    const deletion = await page.request.delete(`${API_ORIGIN}/api/v1/admin/menu-items/1/`, {
      headers: { "X-CSRFToken": csrf },
    });
    expect(deletion.status()).toBe(403);
    expect((await deletion.json()).error.code).toBe("auth.role_forbidden");
    expect((await page.request.get(`${API_ORIGIN}/api/v1/admin/team/`)).status()).toBe(403);

    await page.goto("/admin/team");
    await expect(page.getByRole("heading", { name: "Bu sayfaya yetkiniz yok" })).toBeVisible();
    await context.close();
  });

  test("deactivating a member ends their access immediately", async ({ page, browser }) => {
    // Sign the staff user in again (their password is the new one now).
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await staffPage.goto("/login");
    await staffPage.getByLabel(/^Email/).fill(STAFF_EMAIL);
    await staffPage.getByLabel(/^Şifre/).fill(NEW_PASSWORD);
    await staffPage.getByRole("button", { name: "Giriş yap" }).click();
    await expect(staffPage).toHaveURL(/\/admin\/orders$/);

    // The owner deactivates them.
    await loginAsAdmin(page);
    await page.goto("/admin/team");
    const row = page.getByRole("row", { name: new RegExp(STAFF_EMAIL) });
    await row.getByRole("button", { name: "Pasifleştir" }).click();
    await page.getByRole("button", { name: "Pasifleştir" }).last().click();
    await expect(row.getByText("Pasif")).toBeVisible();

    // The very next request of the open session is refused.
    await staffPage.reload();
    await expect(
      staffPage.getByRole("heading", { name: "Hesabınız bir işletmeye bağlı değil" }),
    ).toBeVisible();
    const refused = await staffPage.request.get(`${API_ORIGIN}/api/v1/admin/orders/`);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe("auth.no_membership");
    await staffContext.close();
  });
});
