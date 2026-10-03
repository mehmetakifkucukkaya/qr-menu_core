import { clickCentered, errorBanners, expect, loginAsAdmin, test } from "./support";

/**
 * Flows 1 and 2 - what a customer does after scanning a QR code - and flow 2c,
 * the business's side of the same order. Runs on a desktop and on a phone viewport.
 */

test.describe("customer menu", () => {
  test("flow 1: the public menu renders only the tenant's data and the language switch translates it", async ({
    page,
  }) => {
    await page.goto("/m/modern-cafe");

    await expect(page.getByRole("heading", { level: 1, name: "Modern Cafe" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Kahveler" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Türk Kahvesi" })).toBeVisible();

    // Nothing from the design mock that used to be hard-coded for every tenant
    // (ANALYSIS_1 F-13) and no owner-facing upsell shown to customers (F-15).
    for (const invented of [
      /MaisonGuest|veloute24/,
      /Servis Aktif/,
      /Sonbahar Menüsü/,
      /Deniz Arda/,
      /Masa #08/,
      /Plan yükseltme/,
    ]) {
      await expect(page.getByText(invented)).toHaveCount(0);
    }

    await page.getByLabel("Dil seçimi").selectOption("en");

    await expect(page).toHaveURL(/locale=en/);
    await expect(page.getByRole("heading", { level: 2, name: "Coffees" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Turkish Coffee" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Kahveler" })).toHaveCount(0);
  });

  test("flow 1b: the menu fits the screen width (no sideways scrolling)", async ({ page }) => {
    // The category chip row used to use negative margins that made the page
    // ~13 px wider than a phone, so the browser zoomed out / scrolled sideways.
    await page.goto("/m/modern-cafe");
    await expect(page.getByRole("heading", { level: 1, name: "Modern Cafe" })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "the page is wider than the viewport").toBeLessThanOrEqual(0);
  });

  test("flow 2b: a returning customer's saved cart is restored without a hydration error", async ({
    page,
  }) => {
    // What the cart store wrote to localStorage on a previous visit. The server
    // renders an empty cart; applying this during the first client render used
    // to fail hydration ("Expected server HTML to contain a matching <span> in
    // <button>") and throw the page away for client rendering. The guard in
    // support.ts fails the test on that error.
    const saved = JSON.stringify({
      state: {
        items: [
          { menuItemId: 1, name: "Türk Kahvesi", price: "75.00", currency: "TRY", quantity: 2 },
        ],
        tableNumber: "",
      },
      version: 0,
    });
    await page.addInitScript((value) => window.localStorage.setItem("qr-menu-cart", value), saved);

    await page.goto("/m/modern-cafe");

    // Restored AFTER hydration: header badge and cart contents show the saved items.
    await expect(page.getByRole("button", { name: "Sepetim — 2 ürün" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Sepetim — 2 ürün" }).first().click();
    const cart = page.getByRole("dialog", { name: "Sepetim" });
    await expect(cart).toContainText("Türk Kahvesi");
    await expect(cart).toContainText("₺150,00");
  });

  test("flow 2: add to cart and place an order that the business can see", async ({ page }) => {
    await page.goto("/m/modern-cafe");

    // Add one specific item. (Not "the first one": the admin specs may have
    // added a product to the top of this category earlier in the same run.)
    const coffee = page.locator("article").filter({
      has: page.getByRole("heading", { level: 3, name: "Türk Kahvesi", exact: true }),
    });
    await clickCentered(coffee.getByRole("button", { name: "Sepete Ekle" }));

    // Adding an item opens the cart drawer by itself; fall back to the header
    // cart button if that ever stops being the case.
    const cart = page.getByRole("dialog", { name: "Sepetim" });
    await expect(cart)
      .toBeVisible({ timeout: 3_000 })
      .catch(async () => {
        await page.getByRole("button", { name: /^Sepetim/ }).first().click();
      });
    await expect(cart).toContainText("Türk Kahvesi");
    await expect(cart).toContainText("₺75,00");
    await cart.getByRole("button", { name: "Sipariş Ver" }).click();

    // Checkout. Online payment is switched off server-side (PAYMENTS_ENABLED
    // defaults to off), so the customer is asked to confirm paying at the venue.
    const checkout = page.getByRole("dialog", { name: "Sipariş Onayı" });
    await checkout.getByLabel(/^Ad Soyad/).fill("E2E Müşteri");
    await checkout.getByLabel(/^Telefon/).fill("+905551234567");
    await checkout.getByLabel("Masa No").fill("7");
    await checkout.getByRole("checkbox", { name: /Kapıda nakit ödeme/ }).check();
    await checkout.getByRole("button", { name: "Onayla" }).click();

    // The order is created (POST /api/v1/public/orders - the call that 404'd
    // because of the trailing slash) and the customer lands on tracking.
    await page.waitForURL(/\/m\/modern-cafe\/order-confirmation\/[A-Z]{2}-\d{8}-\d{3}$/);
    await expect(page.getByText(/Beklemede/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /^[A-Z]{2}-\d{8}-\d{3}$/ })).toBeVisible();
  });

  test("flow 2c: the order shows up on the dashboard the owner lands on after login", async ({
    page,
  }) => {
    // The dashboard's activity feed looked its audit actions up in a table of
    // nine, and the first order ("order_placed") took the whole page down with
    // "Application error: a server-side exception has occurred" - for the owner
    // that is the page every login lands on. flow 3 cannot see it: it runs
    // before any order exists, so this runs after flow 2 has placed one.
    await loginAsAdmin(page);

    await expect(page.getByText("için özet")).toBeVisible();
    await expect(errorBanners(page)).toHaveCount(0);
    await expect(page.getByText("sipariş alındı").first()).toBeVisible();
  });
});
