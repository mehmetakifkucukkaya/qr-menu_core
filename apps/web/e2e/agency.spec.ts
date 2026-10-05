import type { Browser, BrowserContext, Page } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_PASSWORD, API_ORIGIN, expect, test } from "./support";

/**
 * Flow 10 - the agency runs a customer (SPEC_PILOT_READINESS 2 step 1 and 4).
 *
 * The agency works in the Django admin (backend origin), the owner in the web
 * app; they are two people, so each gets a browser context of its own (the
 * session cookie has the same name on both origins). Opens a customer from the
 * "Yeni müşteri aç" screen, the owner signs in with the temporary password and
 * must replace it, the agency suspends the customer (the owner's open session
 * is told so, the public menu closes), reactivates it, reissues the owner's
 * password, and the trail shows all of it.
 *
 * The seeded demo account is a superuser, which makes it an agency account.
 */

const stamp = Date.now();
const SLUG = `pilot-${stamp}`;
const NAME = "Pilot Kafe";
const OWNER_EMAIL = `sahip-${stamp}@pilot.local`;
const CHOSEN_PASSWORD = "Yepyeni-Sifre-2026!";
const AGENCY = `${API_ORIGIN}/django-admin`;

let agencyContext: BrowserContext;
let agency: Page;
let ownerContext: BrowserContext;
let owner: Page;
let temporaryPassword = "";

async function signInToAgencyPanel(browser: Browser) {
  agencyContext = await browser.newContext();
  agency = await agencyContext.newPage();
  await agency.goto(`${AGENCY}/login/`);
  await agency.locator("#id_username").fill(ADMIN_EMAIL);
  await agency.locator("#id_password").fill(ADMIN_PASSWORD);
  await agency.locator('input[type="submit"]').click();
  await expect(agency.locator("#site-name")).toContainText("QR Menü — Ajans Paneli");
}

/** The customer's row in the Müşteriler list. */
function customerRow() {
  return agency.locator("#result_list tbody tr", { hasText: SLUG });
}

/** Tick the customer in the list and run a list action (the confirmation, if any, is up to the caller). */
async function runAction(action: string) {
  await agency.goto(`${AGENCY}/organizations/organization/?q=${SLUG}`);
  await customerRow().locator('input[name="_selected_action"]').check();
  await agency.locator('select[name="action"]').selectOption(action);
  await agency.locator('button[name="index"]').click();
}

async function confirm() {
  await agency.getByRole("button", { name: "Evet, uygula" }).click();
}

async function signInAsOwner(password: string) {
  await owner.goto("/login");
  await owner.getByLabel(/^Email/).fill(OWNER_EMAIL);
  await owner.getByLabel(/^Şifre/).fill(password);
  await owner.getByRole("button", { name: "Giriş yap" }).click();
}

async function chooseNewPassword(current: string) {
  await expect(owner.getByRole("heading", { name: "Şifrenizi belirleyin" })).toBeVisible();
  await owner.getByLabel(/^Mevcut şifre/).fill(current);
  await owner.getByLabel(/^Yeni şifre\*?$/).fill(CHOSEN_PASSWORD);
  await owner.getByLabel(/^Yeni şifre \(tekrar\)/).fill(CHOSEN_PASSWORD);
  await owner.getByRole("button", { name: "Şifreyi değiştir" }).click();
  await expect(owner).toHaveURL(/\/admin\/dashboard$/);
}

test.describe.serial("agency panel", () => {
  test.beforeAll(async ({ browser }) => {
    await signInToAgencyPanel(browser);
    ownerContext = await browser.newContext();
    owner = await ownerContext.newPage();
  });

  test.afterAll(async () => {
    await agencyContext?.close();
    await ownerContext?.close();
  });

  test("the panel is titled, grouped and in Turkish", async () => {
    // The four groups (a group's title is the link in its table caption).
    await expect(agency.locator("#content caption a.section")).toHaveText([
      "Müşteriler",
      "Siparişler",
      "Plan & Kullanım",
      "Destek",
    ]);
    await agency.goto(`${AGENCY}/organizations/organization/`);
    await expect(agency.locator("#content")).toContainText("İşletme");
    await expect(agency.getByRole("link", { name: "Yeni müşteri aç" })).toBeVisible();
    // The three filters the agency reaches for.
    for (const filter of ["Paket", "Durum", "Deneme"]) {
      await expect(agency.locator("#changelist-filter")).toContainText(filter);
    }
  });

  test("the agency opens a customer; the owner signs in with the temporary password and must replace it", async () => {
    await agency.goto(`${AGENCY}/organizations/organization/`);
    await agency.getByRole("link", { name: "Yeni müşteri aç" }).click();
    await agency.locator("#id_name").fill(NAME);
    await agency.locator("#id_slug").fill(SLUG);
    await agency.locator("#id_owner_name").fill("Pilot Sahibi");
    await agency.locator("#id_owner_email").fill(OWNER_EMAIL);
    await agency.locator("#id_plan").selectOption("pro");
    await agency.locator('input[name="modules"][value="orders"]').check();
    await agency.getByRole("button", { name: "Müşteriyi aç" }).click();

    const shown = agency.getByTestId("temporary-password");
    await expect(shown).toBeVisible();
    temporaryPassword = ((await shown.textContent()) ?? "").trim();
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);
    await expect(agency.locator("#content")).toContainText(`/m/${SLUG}`);
    await expect(agency.locator("#content")).toContainText("bir daha gösterilmez");

    // The owner: temporary password -> forced change -> their own dashboard.
    await signInAsOwner(temporaryPassword);
    await chooseNewPassword(temporaryPassword);
    await expect(owner.getByText(NAME).first()).toBeVisible();

    // The starter content is there: the menu and its first QR code.
    await owner.goto("/admin/menus");
    await expect(owner.getByText("Ana Menü").first()).toBeVisible();
    await owner.goto("/admin/qr-codes");
    await expect(owner.getByText("Ana QR").first()).toBeVisible();
  });

  test("suspending closes the customer: sessions are told, the public menu goes offline", async () => {
    await runAction("suspend");
    await expect(agency.locator("#content")).toContainText("Evet, uygula"); // asks first
    await expect(agency.locator("#content")).toContainText(NAME);
    await confirm();
    await expect(agency.locator(".messagelist")).toContainText("1 müşteri askıya alındı");
    await expect(customerRow()).toContainText("Askıda");

    // The owner's open session: told why, and the server agrees.
    await owner.reload();
    await expect(owner.getByRole("heading", { name: "Hesabınız askıya alındı" })).toBeVisible();
    const refused = await owner.request.get(`${API_ORIGIN}/api/v1/admin/orders/`);
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe("tenant.suspended");

    // Customers scanning the QR code find nothing.
    expect((await owner.request.get(`/m/${SLUG}`)).status()).toBe(404);

    // The only way on is to sign out.
    await owner.getByRole("button", { name: "Çıkış yap" }).click();
    await expect(owner).toHaveURL(/\/login/);
    await signInAsOwner(CHOSEN_PASSWORD);
    await expect(owner.getByText("Hesabınız askıya alındı")).toBeVisible();
  });

  test("reactivating brings everything back", async () => {
    await runAction("reactivate");
    await expect(agency.locator(".messagelist")).toContainText("1 müşteri yeniden etkinleştirildi");
    await expect(customerRow()).toContainText("Aktif");

    // The owner signs in again (the sign-in was refused while suspended).
    await signInAsOwner(CHOSEN_PASSWORD);
    await expect(owner).toHaveURL(/\/admin\/dashboard$/);
    await expect(owner.getByText(NAME).first()).toBeVisible();
    expect((await owner.request.get(`/m/${SLUG}`)).status()).toBe(200);
  });

  test("a forgotten owner password is reissued once and ends the old session", async () => {
    await runAction("reset_owner_password");
    await confirm();
    const shown = agency.getByTestId("temporary-password");
    await expect(shown).toBeVisible();
    const reissued = ((await shown.textContent()) ?? "").trim();
    expect(reissued).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(reissued).not.toBe(temporaryPassword);
    await expect(agency.locator("#content")).toContainText("bir daha gösterilmez");

    // The owner's open session is gone with the old password...
    await owner.goto("/admin/dashboard");
    await expect(owner).toHaveURL(/\/login/);
    // ...and the new temporary one must be replaced again.
    await signInAsOwner(reissued);
    await chooseNewPassword(reissued);
  });

  test("the audit trail shows who did what to the customer", async () => {
    await agency.goto(`${AGENCY}/audit/auditevent/?q=${SLUG}`);
    const list = agency.locator("#result_list");
    await expect(list).toContainText(`${NAME} (${SLUG})`);
    for (const action of ["Deactivated", "Reactivated", "Onboarding: tenant + owner signup"]) {
      await expect(list).toContainText(action);
    }
    // Opening a record shows it read-only: nothing to save.
    await list.locator("tbody tr th a").first().click();
    await expect(agency.locator("#content")).toContainText("Pilot Kafe");
    await expect(agency.locator('input[name="_save"]')).toHaveCount(0);
  });
});
