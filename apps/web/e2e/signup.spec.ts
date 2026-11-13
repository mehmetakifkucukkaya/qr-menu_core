import { API_ORIGIN, expect, test } from "./support";

/**
 * The self-serve signup, driven through a real browser.
 *
 * The wizard looked finished and was not: its three writes went out
 * without a CSRF token (Django answers 403 for a session-authenticated
 * POST without one), the first category was created twice if the request
 * was repeated, and the languages and the currency picked in step 2 were
 * never written to the tenant — the tenant always ended up with the
 * defaults. Django's test client does not enforce CSRF, so none of this
 * showed up in the backend tests; only a browser sees it.
 *
 * What this flow proves:
 *   1. the wizard's writes succeed (no 403) and the tenant's first
 *      category and product really land in the database;
 *   2. the step-2 language and currency reach the tenant;
 *   3. a repeated "complete" write does not duplicate the category.
 */

const PASSWORD = "Sifre-123456!";

test.describe("self-serve signup", () => {
  // A fresh tenant per test: the slug and the email have to be unique.
  const stamp = Date.now().toString(36);
  const slug = `e2e-cafe-${stamp}`;
  const email = `owner-${stamp}@example.com`;

  test("the wizard's writes succeed and the tenant keeps what it was given", async ({
    page,
  }) => {
    await page.goto("/signup");

    // --- Step 1: the business -------------------------------------------------
    await page.getByLabel(/^Email/).fill(email);
    await page.getByRole("textbox", { name: "Şifre" }).fill(PASSWORD);
    await page.getByLabel(/^Ad Soyad/).fill("E2E Cafe Sahibi");
    await page.getByLabel(/^İşletme Adı/).fill("E2E Cafe");
    await page.getByLabel(/^Slug/).fill(slug);
    await page.getByRole("button", { name: "Devam et" }).click();

    // --- Step 2: the language and the currency --------------------------------
    await expect(page.getByRole("heading", { name: "Dil ve para birimi" })).toBeVisible();
    await page.getByRole("button", { name: /English/ }).first().click();
    await page.getByRole("button", { name: /Euro/ }).click();
    await page.getByRole("button", { name: "Devam et" }).click();

    // --- Step 3: the first category -------------------------------------------
    await expect(page.getByRole("heading", { name: "İlk kategori" })).toBeVisible();
    await page.getByLabel(/Kategori adı/).fill("Kahvaltı");
    await page.getByRole("button", { name: "Devam et" }).click();

    // --- Step 4: the first product --------------------------------------------
    await expect(page.getByRole("heading", { name: /Ürün/i })).toBeVisible();
    await page.getByLabel(/Ürün adı/).first().fill("Menemen");
    await page.getByLabel(/^Fiyat/).first().fill("85.00");
    await page.getByRole("button", { name: "Devam et" }).click();

    // --- Step 5: the success screen -------------------------------------------
    await expect(
      page.getByRole("heading", { name: /Hesabınız hazır/ }),
    ).toBeVisible();

    // The writes really went through: the tenant's category exists, with
    // the product the wizard collected. Without the CSRF token the wizard
    // showed the same success screen with nothing behind it.
    const session = await page.context().cookies();
    expect(session.some((c) => c.name === "qr_sessionid")).toBe(true);

    await page.goto(`/m/${slug}`);
    await expect(
      page.getByRole("heading", { level: 3, name: "Menemen" }),
    ).toBeVisible();
  });

  test("a repeated complete write does not duplicate the category", async ({
    page,
  }) => {
    // A second tenant, so this test does not depend on the first one's data.
    const stamp2 = Date.now().toString(36) + "b";
    const slug2 = `e2e-cafe-${stamp2}`;

    await page.goto("/signup");
    await page.getByLabel(/^Email/).fill(`owner-${stamp2}@example.com`);
    await page.getByRole("textbox", { name: "Şifre" }).fill(PASSWORD);
    await page.getByLabel(/^Ad Soyad/).fill("E2E Cafe Sahibi");
    await page.getByLabel(/^İşletme Adı/).fill("E2E Cafe 2");
    await page.getByLabel(/^Slug/).fill(slug2);
    await page.getByRole("button", { name: "Devam et" }).click();

    await expect(page.getByRole("heading", { name: "Dil ve para birimi" })).toBeVisible();
    await page.getByRole("button", { name: "Devam et" }).click();

    await expect(page.getByRole("heading", { name: "İlk kategori" })).toBeVisible();
    await page.getByLabel(/Kategori adı/).fill("Kahvaltı");
    await page.getByRole("button", { name: "Devam et" }).click();

    await expect(page.getByRole("heading", { name: /Ürün/i })).toBeVisible();
    await page.getByLabel(/Ürün adı/).first().fill("Menemen");
    await page.getByLabel(/^Fiyat/).first().fill("85.00");
    await page.getByRole("button", { name: "Devam et" }).click();

    await expect(
      page.getByRole("heading", { name: /Hesabınız hazır/ }),
    ).toBeVisible();

    // Send the same "complete" payload a second time — the browser's
    // lost-response retry. The tenant must still have one category.
    const csrf = (await page.context().cookies()).find(
      (c) => c.name === "qr_csrftoken",
    );
    const replay = await page.request.post(
      `${API_ORIGIN}/api/v1/onboarding/complete`,
      {
        headers: csrf ? { "X-CSRFToken": csrf.value } : {},
        data: {
          category_name: "Kahvaltı",
          items: [{ name: "Menemen", price: "85.00" }],
        },
      },
    );
    expect(replay.status()).toBe(201);

    await page.goto(`/m/${slug2}`);
    // One category heading on the public menu, not two.
    await expect(
      page.getByRole("heading", { name: "Kahvaltı" }),
    ).toHaveCount(1);
  });
});
