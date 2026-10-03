import { deflateSync } from "node:zlib";

import { expect, test as base, type Locator, type Page } from "@playwright/test";

/** Origin of the Django API the harness started (set by playwright.config.ts). */
export const API_ORIGIN = process.env.E2E_API_ORIGIN ?? "http://localhost:8200";

/** Folder the harness's backend stores uploaded files in (throwaway, wiped every run). */
export const MEDIA_DIR = process.env.E2E_MEDIA_DIR ?? "";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

/**
 * `test` with an automatic guard that turns silent breakage into a failure.
 *
 * Most of what the audit found was swallowed by `catch (() => null)` and
 * rendered as an empty page, so asserting on the visible UI alone would not
 * have caught it. The guard watches every response and page error during the
 * test and fails it when it sees:
 *
 *   - any HTTP 5xx (from the Next.js server or the API);
 *   - a routing 404 from the API: an HTML 404 page means "no such URL" (the
 *     trailing-slash bug). A JSON 404 is a legitimate "not found" answer and
 *     is allowed;
 *   - an uncaught exception in the page;
 *   - a React hydration mismatch (server HTML != first client render). Dev
 *     builds say "Hydration failed ..."; production builds only log
 *     "Minified React error #418 / #423 / #425".
 */
const HYDRATION_ERROR = /hydration|did not match|Minified React error #(418|419|422|423|425)\b/i;

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];

      page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && HYDRATION_ERROR.test(message.text())) {
          problems.push(`hydration error: ${message.text().split("\n")[0].slice(0, 200)}`);
        }
      });
      page.on("response", (response) => {
        const status = response.status();
        const url = response.url();
        const contentType = response.headers()["content-type"] ?? "";
        if (status >= 500) {
          problems.push(`HTTP ${status} ${response.request().method()} ${url}`);
        } else if (
          status === 404 &&
          url.startsWith(`${API_ORIGIN}/api/`) &&
          contentType.includes("text/html")
        ) {
          problems.push(`routing 404 (no such API route) ${response.request().method()} ${url}`);
        }
      });

      await use();

      expect(problems, "unexpected server errors / broken API routes / hydration errors during the test").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Click an element after centring it in the viewport.
 *
 * Playwright's own scroll-into-view stops at the nearest edge, which parks the
 * element under the menu page's sticky header (or the mobile bottom bar) and
 * the click is then intercepted; a person would simply scroll a bit further.
 * So the element is centred here, instantly (the site sets
 * `scroll-behavior: smooth`, and clicking mid-glide hits whatever passes under
 * the pointer).
 *
 * `force: true` then skips Playwright's second scroll + hit-target check. On an
 * emulated phone the menu page is ~12 px wider than the screen (the category
 * nav's negative margins), which makes Chromium report an offset visual
 * viewport and Playwright's check flags the button as covered even though a
 * real click at its centre lands on it. The click itself is still a real mouse
 * event at the element's centre, so a genuinely covered button still fails the
 * test (nothing would happen).
 */
export async function clickCentered(locator: Locator): Promise<void> {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await locator.click({ force: true });
}

/** Page-level error banners (AdminErrorState & co), not Next's empty route announcer. */
export function errorBanners(page: Page): Locator {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

/** Sign in through the real login form (a Next.js server action). */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/^Email/).fill(ADMIN_EMAIL);
  await page.getByLabel(/^Şifre/).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL("**/admin/dashboard");
}

/* ── Test images ─────────────────────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const chunk = Buffer.alloc(8 + data.length + 4);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), 4 + typeAndData.length);
  return chunk;
}

/**
 * A valid `width` x `height` PNG (a horizontal colour gradient), built without
 * an image library. Every row is identical, so it deflates to a few KB even at
 * 2400 x 1600 - larger than the 1920 x 1080 the backend resizes photos to,
 * which lets a test prove the resize happened.
 */
export function makePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB (compression, filter, interlace stay 0)

  const stride = 1 + width * 3; // each row starts with its filter type (0 = none)
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * stride + 1 + x * 3;
      raw[i] = Math.floor((x * 255) / width);
      raw[i + 1] = 110;
      raw[i + 2] = 170;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Wait until an `<img>` has really loaded and return its natural width.
 *
 * A 404 or a corrupt file leaves `naturalWidth` at 0 while the element is
 * still in the DOM, so "the img exists" proves nothing about the picture.
 */
export async function loadedImageWidth(image: Locator): Promise<number> {
  await image.scrollIntoViewIfNeeded(); // card photos are loading="lazy"
  const width = () => image.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  await expect
    .poll(width, { message: "the image never loaded (a 404 leaves naturalWidth at 0)" })
    .toBeGreaterThan(0);
  return width();
}
