import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import {
  API_ORIGIN,
  MEDIA_DIR,
  clickCentered,
  expect,
  loadedImageWidth,
  loginAsAdmin,
  makePng,
  test,
} from "./support";

/**
 * Flow 8 - photos are optional.
 *
 * A business may add a photo to a product or to a category, or leave both out.
 * These flows walk the whole path a photo takes: picked in the admin form ->
 * checked in the browser -> uploaded and resized by the backend -> saved with
 * the product -> served on the public menu. They run in order against the
 * harness's fresh `seed_demo` data (menu 1, category 1 "Kahveler"), which has
 * no photos, so every card starts out text-only.
 *
 * The step that matters most is the last one: an uploaded picture must really
 * load on the public page. Outside production nothing but the web app answers
 * `/media/...`, and it used to answer 404 - the upload "worked" and the menu
 * showed no photo. `loadedImageWidth` fails on that, because a missing file
 * leaves `naturalWidth` at 0.
 */

const photoSection = (page: Page) => page.getByRole("region", { name: "Fotoğraf", exact: true });
const categoryPhotoSection = (page: Page) =>
  page.getByRole("region", { name: "Kategori fotoğrafı", exact: true });

test.describe.serial("optional photos", () => {
  const productName = `E2E Fotoğraflı ${Date.now()}`;
  let editUrl = "";

  test("flow 8a: add a product photo - checked, uploaded, resized, shown on the public menu", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menus/1/categories/1/items/new");

    const section = photoSection(page);
    await expect(section.getByText("İsteğe bağlı")).toBeVisible();
    const fileInput = section.locator('input[type="file"]');

    // Refused in the browser, before anything is sent.
    await fileInput.setInputFiles({
      name: "menu.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
    await expect(section.getByRole("alert")).toContainText("JPG, PNG veya WEBP");
    await fileInput.setInputFiles({
      name: "buyuk.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(section.getByRole("alert")).toContainText("en fazla 5 MB");
    await expect(section.locator("img")).toHaveCount(0);

    // A 2400 x 1600 photo is larger than anything a menu needs.
    await fileInput.setInputFiles({
      name: "tatli.png",
      mimeType: "image/png",
      buffer: makePng(2400, 1600),
    });
    await expect(section.getByRole("status")).toContainText("Fotoğraf yüklendi", { timeout: 30_000 });
    const preview = section.locator("img");
    // After the upload the preview is the file the SERVER hands out, not the local copy.
    await expect(preview).toHaveAttribute("src", /^\/media\/tenants\/.+\.png$/);
    await loadedImageWidth(preview);

    await page.getByRole("textbox", { name: /Ürün adı/ }).fill(productName);
    await page.getByRole("textbox", { name: "Fiyat", exact: true }).fill("55");
    await page.getByRole("button", { name: "Ürünü oluştur" }).click();
    await page.waitForURL(/\/items\/\d+\/edit$/);
    editUrl = page.url();

    // Saved with the product: the edit page loads it back from the stored item.
    await loadedImageWidth(photoSection(page).locator("img"));

    // The product list shows it as a thumbnail.
    await page.goto("/admin/menus/1/categories/1/items");
    await loadedImageWidth(page.locator("tr").filter({ hasText: productName }).locator("img"));

    // And customers see it, resized to fit within 1920 px.
    await page.goto("/m/modern-cafe");
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { level: 3, name: productName }),
    });
    const width = await loadedImageWidth(card.locator("img"));
    expect(width, "the 2400 px upload should have been resized").toBeLessThanOrEqual(1920);

    // The detail sheet shows the photo flush with its top edge, with the close
    // button floating over it. (The button used to sit in the page flow: a blank
    // strip above the photo and the X half outside the sheet - a layout only a
    // dish WITH a photo ever reaches.)
    await clickCentered(card.getByRole("button", { name: productName, exact: true }));
    const sheet = page.getByRole("dialog", { name: productName });
    await expect(sheet).toBeVisible();
    const panel = (await sheet.locator(":scope > div").first().boundingBox())!;
    const hero = (await sheet.locator("img").boundingBox())!;
    const close = (await sheet.getByRole("button", { name: "Kapat" }).boundingBox())!;
    const slack = 1.5; // the sheet may still be easing in
    expect(Math.abs(hero.y - panel.y), "the photo starts at the sheet's top edge").toBeLessThanOrEqual(slack);
    expect(close.x, "close button inside the sheet (left)").toBeGreaterThanOrEqual(panel.x - slack);
    expect(close.x + close.width, "close button inside the sheet (right)").toBeLessThanOrEqual(panel.x + panel.width + slack);
    expect(close.y + close.height, "close button floats over the photo").toBeLessThanOrEqual(hero.y + hero.height);
    await sheet.getByRole("button", { name: "Kapat" }).click();
    await expect(sheet).toBeHidden();
  });

  test("flow 8b: removing the photo leaves an ordinary text-only product", async ({ page }) => {
    expect(editUrl, "flow 8a must have created the product").not.toBe("");
    await loginAsAdmin(page);
    await page.goto(editUrl);

    const section = photoSection(page);
    await section.getByRole("button", { name: "Fotoğrafı kaldır" }).click();
    await expect(section.getByRole("status")).toContainText("Fotoğraf kaldırıldı");
    // The empty drop zone is back instead of a stale preview.
    await expect(section.getByText("Ürün fotoğrafı ekle")).toBeVisible();
    await expect(section.locator("img")).toHaveCount(0);

    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await page.waitForURL(/\/categories\/1\/items$/);

    await page.goto("/m/modern-cafe");
    const card = page.locator("article").filter({
      has: page.getByRole("heading", { level: 3, name: productName }),
    });
    await expect(card).toContainText("₺55,00");
    await expect(card.locator("img")).toHaveCount(0);
  });

  test("flow 8c: a category photo is an optional banner above its title", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menus/1/categories/1/edit");

    const section = categoryPhotoSection(page);
    await expect(section.getByText("İsteğe bağlı")).toBeVisible();
    await section.locator('input[type="file"]').setInputFiles({
      name: "kahve.png",
      mimeType: "image/png",
      buffer: makePng(2400, 1000),
    });
    await expect(section.getByRole("status")).toContainText("Fotoğraf yüklendi", { timeout: 30_000 });
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await page.waitForURL(/\/categories\/1\/items$/);

    // The banner is the first thing inside the category's section.
    await page.goto("/m/modern-cafe");
    await loadedImageWidth(page.locator("#category-kahveler > div > img"));

    // Put the seed data back: no photo, no banner, the category still shows.
    await page.goto("/admin/menus/1/categories/1/edit");
    await categoryPhotoSection(page).getByRole("button", { name: "Fotoğrafı kaldır" }).click();
    await page.getByRole("button", { name: "Değişiklikleri kaydet" }).click();
    await page.waitForURL(/\/categories\/1\/items$/);

    await page.goto("/m/modern-cafe");
    await expect(page.getByRole("heading", { level: 2, name: "Kahveler" })).toBeVisible();
    await expect(page.locator("#category-kahveler > div > img")).toHaveCount(0);
  });

  test("flow 8d: a refused upload says so and keeps the photo that was already there", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menus/1/categories/1/items/new");
    const section = photoSection(page);
    const fileInput = section.locator('input[type="file"]');

    await fileInput.setInputFiles({ name: "ilk.png", mimeType: "image/png", buffer: makePng(800, 600) });
    await expect(section.getByRole("status")).toContainText("Fotoğraf yüklendi", { timeout: 30_000 });
    const kept = await section.locator("img").getAttribute("src");
    expect(kept).toMatch(/^\/media\//);

    // The server turns the next file down (a 4xx: the guard treats 5xx as a bug).
    await page.route("**/api/v1/admin/media/upload/", (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "media.invalid_image", message: "Dosya okunamadı. Başka bir fotoğraf deneyin." },
        }),
      }),
    );
    await fileInput.setInputFiles({ name: "ikinci.png", mimeType: "image/png", buffer: makePng(800, 600) });
    await expect(section.getByRole("alert")).toContainText("Dosya okunamadı");
    // Nothing was lost: the first photo is still the one that will be saved.
    await expect(section.locator("img")).toHaveAttribute("src", kept!);
    await expect(section.getByRole("button", { name: "Fotoğrafı kaldır" })).toBeVisible();
  });

  test("flow 8e: /media is read-only and refuses path tricks", async ({ request }) => {
    // A picture that does not exist is a plain 404, not an error page.
    expect((await request.get("/media/tenants/modern-cafe/image/nope.png")).status()).toBe(404);
    // Nothing but GET / HEAD.
    expect((await request.post("/media/tenants/modern-cafe/image/nope.png")).status()).toBe(405);
    // Separators smuggled through percent-escapes never reach the backend.
    for (const evil of ["/media/uploads%2f..%2f..%2fsecret.png", "/media/%2e%2e%2fsecret.png"]) {
      expect((await request.get(evil)).status(), evil).toBe(404);
    }
  });

  test("flow 8f: a file that is not a picture is not served through /media", async ({ request }) => {
    // Imported PDFs live on the same media volume as the photos; the site must
    // never hand them out, even though the backend would.
    test.skip(!MEDIA_DIR, "needs the media folder of the harness's own backend");
    const dir = path.join(MEDIA_DIR, "pdf_imports", "e2e");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "secret.pdf"), "%PDF-1.4\n% e2e fixture\n");
    try {
      // Precondition: the backend itself serves it, so the 404 below is the proxy's decision.
      const direct = await request.get(`${API_ORIGIN}/media/pdf_imports/e2e/secret.pdf`);
      expect(direct.status(), "the harness backend should serve its media folder").toBe(200);
      expect(direct.headers()["content-type"]).toContain("application/pdf");

      expect((await request.get("/media/pdf_imports/e2e/secret.pdf")).status()).toBe(404);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
