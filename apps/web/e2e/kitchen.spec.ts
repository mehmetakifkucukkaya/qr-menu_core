import type { APIRequestContext, Page } from "@playwright/test";

import { API_ORIGIN, clickCentered, expect, loginAsAdmin, test } from "./support";

/**
 * Flow 11 - the kitchen screen (SPEC_PILOT_READINESS 2 steps 5-6 and 8).
 *
 * A customer's order reaches the board within seconds without anybody reloading
 * anything, with the number, table, lines, notes and allergens a cook needs and
 * without the customer's phone number; the cook moves it across the three
 * columns with one tap each; cancelling needs a reason the customer can read;
 * "Servisi başlat" rings the bell for a new order until its card is touched; and
 * when the connection drops the last orders stay on screen with a strip that says
 * so, and the screen recovers by itself.
 *
 * Orders are placed through the public API (what the menu page calls), which
 * keeps these flows short; the customer's own screens are covered in
 * customer.spec.ts. The spec runs after customer.spec.ts, so the board may
 * already hold that spec's order: every check looks for its own order number.
 */

const stamp = Date.now();
const PHONE = "+905551234567";
let placed = 0;

let itemIds: Record<string, number> | null = null;
async function menuItemId(request: APIRequestContext, name: string): Promise<number> {
  if (itemIds === null) {
    const response = await request.get(`${API_ORIGIN}/api/v1/public/menus/modern-cafe?locale=tr`);
    expect(response.ok()).toBe(true);
    const menu = (await response.json()).data;
    itemIds = {};
    for (const category of menu.categories) for (const item of category.items) itemIds[item.name] = item.id;
  }
  expect(itemIds[name], `"${name}" is on the demo menu`).toBeGreaterThan(0);
  return itemIds[name];
}

/** Order through the public API, like the menu page does; each order gets its own table number. */
async function placeOrder(
  request: APIRequestContext,
  lines: Array<{ name: string; quantity: number; notes?: string }>,
  notes = "",
): Promise<{ orderNumber: string; table: string }> {
  const table = `K${String(stamp).slice(-5)}-${(placed += 1)}`;
  const items = [];
  for (const line of lines) {
    items.push({ menu_item_id: await menuItemId(request, line.name), quantity: line.quantity, notes: line.notes ?? "" });
  }
  const response = await request.post(`${API_ORIGIN}/api/v1/public/orders`, {
    data: {
      organization_slug: "modern-cafe",
      table_number: table,
      customer_name: "E2E Mutfak",
      customer_phone: PHONE,
      notes,
      items,
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return { orderNumber: (await response.json()).data.order_number, table };
}

/** What the customer's own order page reads. */
async function publicStatus(request: APIRequestContext, orderNumber: string) {
  const response = await request.get(`${API_ORIGIN}/api/v1/public/orders/${orderNumber}/status`);
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const cardIn = (page: Page, columnName: string, orderNumber: string) =>
  column(page, columnName).getByRole("article").filter({ hasText: orderNumber });
const anywhere = (page: Page, orderNumber: string) => page.getByRole("article").filter({ hasText: orderNumber });

async function openKitchen(page: Page) {
  await loginAsAdmin(page);
  await page.goto("/admin/kitchen");
  await expect(page.getByRole("heading", { level: 1, name: "Mutfak Ekranı" })).toBeVisible();
}

test.describe.serial("kitchen screen", () => {
  test("flow 11a: a new order shows up within seconds and goes through the three columns", async ({
    page,
    request,
  }) => {
    await openKitchen(page);
    // A live line with a moving time tells a frozen screen from a quiet kitchen.
    await expect(page.getByText(/Canlı · son güncelleme \d{2}:\d{2}:\d{2}/)).toBeVisible();

    const order = await placeOrder(
      request,
      [
        { name: "Latte", quantity: 2, notes: "az şekerli" },
        { name: "Türk Kahvesi", quantity: 1 },
      ],
      "Pencere kenarı",
    );

    // Nobody reloads: the screen asks again every 5 seconds.
    const card = cardIn(page, "Yeni", order.orderNumber);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toContainText(`Masa ${order.table}`);
    await expect(card.getByText(/^#\d+$/)).toBeVisible();
    await expect(card).toContainText("2×");
    await expect(card).toContainText("Latte");
    await expect(card).toContainText("az şekerli");
    await expect(card).toContainText("Süt Ürünleri"); // the dish's allergen, copied onto the line
    await expect(card).toContainText("Türk Kahvesi");
    await expect(card).toContainText("Pencere kenarı");
    await expect(card).toHaveAttribute("data-alert", "true");

    // The customer's phone number is neither on screen nor in what the screen was sent.
    await expect(card).not.toContainText("5551234567");
    const board = await page.request.get(`${API_ORIGIN}/api/v1/admin/kitchen/board`);
    expect(board.ok()).toBe(true);
    expect(await board.text()).not.toContain("5551234567");

    // One tap per step.
    await card.getByRole("button", { name: "Hazırlamaya başla" }).click();
    await expect(cardIn(page, "Hazırlanıyor", order.orderNumber)).toBeVisible();
    await expect(cardIn(page, "Yeni", order.orderNumber)).toHaveCount(0);
    expect((await publicStatus(request, order.orderNumber)).status).toBe("preparing");

    await cardIn(page, "Hazırlanıyor", order.orderNumber).getByRole("button", { name: "Hazır", exact: true }).click();
    await expect(cardIn(page, "Hazır", order.orderNumber)).toBeVisible();
    expect((await publicStatus(request, order.orderNumber)).status).toBe("ready");

    await cardIn(page, "Hazır", order.orderNumber).getByRole("button", { name: "Teslim edildi" }).click();
    await expect(anywhere(page, order.orderNumber)).toHaveCount(0);
    expect((await publicStatus(request, order.orderNumber)).status).toBe("delivered");
  });

  test("flow 11b: cancelling asks for a reason, and the customer's order carries it", async ({ page, request }) => {
    const order = await placeOrder(request, [{ name: "Latte", quantity: 1 }]);
    await openKitchen(page);

    const card = cardIn(page, "Yeni", order.orderNumber);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "İptal", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: "Siparişi iptal et" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Siparişi iptal et" })).toBeDisabled();
    await dialog.getByRole("radio", { name: "Ürün tükendi" }).check();
    await dialog.getByRole("button", { name: "Siparişi iptal et" }).click();

    await expect(dialog).toBeHidden();
    await expect(anywhere(page, order.orderNumber)).toHaveCount(0);
    expect(await publicStatus(request, order.orderNumber)).toMatchObject({
      status: "cancelled",
      cancel_reason: "out_of_stock",
      cancel_reason_label: "Ürün tükendi",
    });
  });

  test("flow 11c: 'Servisi başlat' rings for a new order until its card is touched", async ({ page, request }) => {
    // Browsers only allow sound after a tap and a headless one cannot be heard,
    // so the audio API and the wake lock are replaced by counters.
    await page.addInitScript(() => {
      const kitchen = { notes: 0, wakeLocks: 0 };
      (window as unknown as { __kitchen: typeof kitchen }).__kitchen = kitchen;
      class FakeAudioContext {
        currentTime = 0;
        destination = {};
        async resume() {}
        async close() {}
        createOscillator() {
          kitchen.notes += 1;
          return { type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
        }
        createGain() {
          return {
            gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
          };
        }
      }
      (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
      Object.defineProperty(navigator, "wakeLock", {
        configurable: true,
        value: {
          request: async () => {
            kitchen.wakeLocks += 1;
            return { release: async () => {} };
          },
        },
      });
    });
    const count = (key: "notes" | "wakeLocks") =>
      page.evaluate((k) => (window as unknown as { __kitchen: Record<string, number> }).__kitchen[k], key);

    await openKitchen(page);
    await page.getByRole("button", { name: "Servisi başlat" }).click();
    await expect(page.getByRole("button", { name: "Servisi bitir" })).toBeVisible();
    expect(await count("wakeLocks")).toBe(1);
    expect(await count("notes")).toBe(0); // nothing new yet

    const order = await placeOrder(request, [{ name: "Espresso", quantity: 1 }]);
    const card = cardIn(page, "Yeni", order.orderNumber);
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toHaveAttribute("data-alert", "true");
    await expect.poll(() => count("notes"), { message: "the bell rang" }).toBeGreaterThanOrEqual(2);

    // It rings again every few seconds...
    const rung = await count("notes");
    await expect.poll(() => count("notes"), { timeout: 8_000, message: "it keeps ringing" }).toBeGreaterThan(rung);

    // ...until somebody touches the card.
    await card.getByText(order.orderNumber).click();
    await expect(card).toHaveAttribute("data-alert", "false");
    const quiet = await count("notes");
    await page.waitForTimeout(5_500);
    expect(await count("notes")).toBe(quiet);
  });

  test("flow 11d: losing the connection keeps the orders on screen and says so; it recovers by itself", async ({
    page,
    context,
    request,
  }) => {
    const first = await placeOrder(request, [{ name: "Latte", quantity: 1 }]);
    await openKitchen(page);
    await expect(cardIn(page, "Yeni", first.orderNumber)).toBeVisible();

    await context.setOffline(true);
    const banner = page.getByTestId("connection-banner");
    await expect(banner).toContainText("Bağlantı yok", { timeout: 15_000 });
    await expect(banner).toContainText(/son güncelleme \d{2}:\d{2}/);
    await expect(cardIn(page, "Yeni", first.orderNumber)).toBeVisible(); // the last good orders stay

    // An order placed meanwhile (the test's own API client is not offline).
    const second = await placeOrder(request, [{ name: "Espresso", quantity: 1 }]);

    await context.setOffline(false);
    await expect(banner).toBeHidden({ timeout: 15_000 });
    await expect(cardIn(page, "Yeni", second.orderNumber)).toBeVisible({ timeout: 15_000 });
  });

  test("flow 11e: a customer's note on a dish reaches the kitchen, and the reason for a cancellation reaches the customer", async ({
    page,
    browser,
  }) => {
    // The customer, on their own phone (a separate browser): one dish with a note.
    const customer = await browser.newContext();
    const shopper = await customer.newPage();
    const table = `K${String(stamp).slice(-5)}-${(placed += 1)}`;

    await shopper.goto("/m/modern-cafe");
    const latte = shopper.locator("article").filter({
      has: shopper.getByRole("heading", { level: 3, name: "Latte", exact: true }),
    });
    await clickCentered(latte.getByRole("button", { name: "Sepete Ekle" }));
    const cart = shopper.getByRole("dialog", { name: "Sepetim" });
    await expect(cart).toBeVisible();
    await cart.getByRole("textbox", { name: "Latte için not" }).fill("az şekerli, sıcak olsun");
    await cart.getByRole("button", { name: "Sipariş Ver" }).click();

    const checkout = shopper.getByRole("dialog", { name: "Sipariş Onayı" });
    await checkout.getByLabel(/^Ad Soyad/).fill("E2E Müşteri");
    await checkout.getByLabel(/^Telefon/).fill(PHONE);
    await checkout.getByLabel("Masa No").fill(table);
    await checkout.getByRole("checkbox", { name: /Kapıda nakit ödeme/ }).check();
    await checkout.getByRole("button", { name: "Onayla" }).click();
    await shopper.waitForURL(/\/order-confirmation\/[A-Z]{2}-\d{8}-\d{3}$/);
    const orderNumber = shopper.url().split("/").pop()!;

    // The kitchen sees the note on the dish...
    await openKitchen(page);
    const card = cardIn(page, "Yeni", orderNumber);
    await expect(card).toBeVisible();
    await expect(card).toContainText("az şekerli, sıcak olsun");

    // ...and cancels it with a reason.
    await card.getByRole("button", { name: "İptal", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Siparişi iptal et" });
    await dialog.getByRole("radio", { name: "Mutfak yoğun" }).check();
    await dialog.getByRole("button", { name: "Siparişi iptal et" }).click();
    await expect(anywhere(page, orderNumber)).toHaveCount(0);

    // The customer's page (it asks every 15 seconds) says why.
    await expect(shopper.getByText("İptal Edildi").first()).toBeVisible({ timeout: 25_000 });
    await expect(shopper.getByText("Neden: Mutfak yoğun")).toBeVisible();
    await customer.close();
  });
});
