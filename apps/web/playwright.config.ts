import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests - the release gate (ANALYSIS_1 F-58).
 *
 * Why this exists: every blocker in the first audit passed `tsc`, ESLint, 483
 * backend tests and `next build`, because none of them looks at a running site
 * (admin create/edit pages 500'd, 19 API calls 404'd, order placement failed).
 * These six flows drive a real browser against a production build:
 *
 *   1. public menu + language switch      4. add / edit a product
 *   2. add to cart -> place an order      5. change the price -> see it publicly
 *   3. log in -> dashboard (no error)     6. download a QR code
 *
 * The harness starts its OWN stack on throwaway ports and a throwaway SQLite
 * database - it never touches your dev data:
 *
 *   backend  Django `runserver` on :8200, fresh DB, `seed_demo` data
 *   web      `next build` + `next start` on :3200, pointed at that backend
 *
 * Run:  npm run test:e2e        (see e2e/README.md for env overrides)
 */

const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 8200);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3200);
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
const API_ORIGIN = `http://localhost:${BACKEND_PORT}`;
const PYTHON = process.env.E2E_PYTHON ?? "python3";
const BACKEND_DIR = path.resolve(__dirname, "../../backend");
const DB_FILE = path.join(os.tmpdir(), `qrmenu-e2e-${BACKEND_PORT}.sqlite3`);
// Uploaded photos land here, not in backend/media, and are wiped on every run.
const MEDIA_DIR = path.join(os.tmpdir(), `qrmenu-e2e-${BACKEND_PORT}-media`);

// Throwaway credentials, generated once per run. The main Playwright process
// sets them before the workers are spawned, so every process sees the same
// values; the seeded admin and the tests agree without anything being written
// to disk or committed.
process.env.E2E_ADMIN_EMAIL ??= "e2e-admin@modern-cafe.local";
process.env.E2E_ADMIN_PASSWORD ??= randomBytes(12).toString("hex");
process.env.E2E_SECRET ??= randomBytes(24).toString("hex");
process.env.E2E_API_ORIGIN = API_ORIGIN;
process.env.E2E_MEDIA_DIR = MEDIA_DIR;

const skipBuild = process.env.E2E_SKIP_BUILD === "1";

export default defineConfig({
  testDir: "./e2e",
  // The admin flows build on each other (create -> edit -> price -> public).
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: WEB_ORIGIN,
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // E2E_CHANNEL=chrome|msedge uses an installed browser instead of
    // Playwright's bundled Chromium.
    channel: process.env.E2E_CHANNEL || undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // The product is used on phones: run the customer flows on a phone viewport too.
    {
      name: "mobile-customer",
      testMatch: /customer\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: [
    {
      name: "backend",
      cwd: BACKEND_DIR,
      command:
        `rm -f "${DB_FILE}" && rm -rf "${MEDIA_DIR}" && ` +
        `${PYTHON} manage.py migrate --noinput && ` +
        `${PYTHON} manage.py seed_demo && ` +
        `${PYTHON} manage.py runserver 127.0.0.1:${BACKEND_PORT} --noreload`,
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PYTHONUNBUFFERED: "1",
        DJANGO_SETTINGS_MODULE: "config.settings.local",
        DJANGO_SECRET_KEY: process.env.E2E_SECRET!,
        DJANGO_DEBUG: "1",
        DATABASE_URL: `sqlite:///${DB_FILE}`,
        MEDIA_ROOT: MEDIA_DIR,
        CORS_ALLOWED_ORIGINS: WEB_ORIGIN,
        PUBLIC_BASE_URL: WEB_ORIGIN,
        ANALYTICS_SALT: process.env.E2E_SECRET!,
        INTERNAL_API_TOKEN: process.env.E2E_SECRET!,
        DEMO_BUSINESS_SLUG: "modern-cafe",
        DEMO_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL!,
        DEMO_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD!,
        // PAYMENTS_ENABLED is left unset on purpose: the default (off) is what
        // production runs, so checkout must offer "cash at the venue".
      },
    },
    {
      name: "web",
      cwd: __dirname,
      command: `${skipBuild ? "" : "npm run build && "}npx next start -p ${WEB_PORT}`,
      url: `${WEB_ORIGIN}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        NEXT_TELEMETRY_DISABLED: "1",
        // Inlined into the browser bundle at build time (see apps/web/Dockerfile).
        NEXT_PUBLIC_API_BASE_URL: API_ORIGIN,
        NEXT_PUBLIC_BASE_URL: WEB_ORIGIN,
        // Read by the server per request.
        INTERNAL_API_BASE_URL: `http://127.0.0.1:${BACKEND_PORT}`,
        INTERNAL_API_TOKEN: process.env.E2E_SECRET!,
        // No menu cache: a price change must be visible on the next page load.
        PUBLIC_MENU_CACHE_TTL_SECONDS: "0",
      },
    },
  ],
});
