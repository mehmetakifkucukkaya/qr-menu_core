import { ADMIN_EMAIL, API_ORIGIN, errorBanners, expect, loginAsAdmin, test } from "./support";

/**
 * Flows 3-6 - what the business owner does in the admin panel. They build on
 * each other (a product is created, edited, repriced, then seen publicly), so
 * they run in order against the harness's fresh `seed_demo` database
 * (menu 1, category 1 "Kahveler", QR code 5).
 */

test.describe.serial("admin panel", () => {
  const stamp = Date.now();
  const productName = `E2E Ürün ${stamp}`;
  let editUrl = "";

  test("flow 3: log in and land on a dashboard that loaded its data", async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    // The dashboard summary call used to 404 and was rendered as a red error banner.
    await expect(page.getByText("için özet")).toBeVisible();
    await expect(errorBanners(page)).toHaveCount(0);
    for (const label of ["Menü", "Kategori", "Ürün", "Şube"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Modern Cafe").first()).toBeVisible();
    // Signed in as the harness's admin.
    expect(ADMIN_EMAIL).not.toBe("");
  });

  test("flow 4: create a product, then edit it (both pages used to answer HTTP 500)", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await page.goto("/admin/menus/1/categories/1/items/new");
    await page.getByRole("textbox", { name: /Ürün adı/ }).fill(productName);
    await page.getByRole("textbox", { name: "Açıklama" }).fill("İlk açıklama");
    await page.getByRole("textbox", { name: "Fiyat", exact: true }).fill("42.50");
    await page.getByRole("button", { name: "Ürünü oluştur" }).click();

    // Creating redirects to the new item's edit page.
    await page.waitForURL(/\/items\/\d+\/edit$/);
    editUrl = page.url();
    await expect(page.getByRole("textbox", { name: /Ürün adı/ })).toHaveValue(productName);

    // Edit the description and save; editing redirects to the category's item list.
    await page.getByRole("textbox", { name: "Açıklama" }).fill("Güncellenmiş açıklama");
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await page.waitForURL(/\/categories\/1\/items$/);
    await expect(page.getByText(productName).first()).toBeVisible();

    // The edit really persisted.
    await page.goto(editUrl);
    await expect(page.getByRole("textbox", { name: "Açıklama" })).toHaveValue("Güncellenmiş açıklama");
  });

  test("flow 5: a price change shows up on the public menu", async ({ page }) => {
    expect(editUrl, "flow 4 must have created the product").not.toBe("");
    await loginAsAdmin(page);

    // Before: the product is public at its original price.
    await page.goto("/m/modern-cafe");
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { level: 3, name: productName }),
    });
    await expect(card).toContainText("₺42,50");

    await page.goto(editUrl);
    await page.getByRole("textbox", { name: "Fiyat", exact: true }).fill("99.50");
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await page.waitForURL(/\/categories\/1\/items$/);

    await page.goto("/m/modern-cafe");
    await expect(card).toContainText("₺99,50");
    await expect(card).not.toContainText("₺42,50");
  });

  test("flow 6: a QR code can be opened and its PNG downloaded", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/admin/qr-codes/5");
    const link = page.getByRole("link", { name: /PNG indir/ });
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    expect(href).toBe(`${API_ORIGIN}/api/v1/admin/qr-codes/5/download`);

    // Same request the browser makes (with the session cookie from the login).
    const response = await page.context().request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const png = await response.body();
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.length).toBeGreaterThan(500);
  });
});

test.describe("admin on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("flow 7: the menu button opens the navigation drawer and moves between sections", async ({
    page,
  }) => {
    // Below `md` the sidebar is hidden. With no menu button a phone user had no
    // way to reach any section but the one they landed on.
    await loginAsAdmin(page);

    await page.getByRole("button", { name: "Menüyü aç" }).click();
    const drawer = page.getByRole("dialog", { name: "Admin menüsü" });
    await expect(drawer).toBeVisible();

    await drawer.getByRole("link", { name: "Siparişler" }).click();
    await page.waitForURL(/\/admin\/orders$/);
    await expect(page.getByRole("heading", { level: 1, name: "Siparişler" })).toBeVisible();
    // The drawer closes itself once navigation has happened.
    await expect(drawer).toBeHidden();
  });
});
