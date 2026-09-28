/**
 * Unit tests for `lib/currency.ts` — Sprint A (Faz 1.2).
 *
 * Uses Node 22+ built-in `node:test` runner with the
 * `--experimental-strip-types` flag (no Vitest/Jest in V1 frontend —
 * keep the toolchain small). Run via:
 *   cd apps/web && npm run test:currency
 *
 * Covers the 4-step fallback chain called out in the Sprint A
 * acceptance criteria:
 *   1. menu.currency wins when present
 *   2. business.currency wins when menu is empty
 *   3. first item with a non-empty currency wins when both are empty
 *   4. "TRY" is the TR market default when everything is empty
 *
 * Plus defensive cases: empty strings, whitespace, lowercase codes,
 * oversize codes, missing arrays, null payloads.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveCurrency, DEFAULT_CURRENCY } from "./currency.ts";

test("priority 1: menu.currency wins", () => {
  assert.equal(
    resolveCurrency({ currency: "EUR" }, { currency: "USD" }, [{ currency: "GBP" }]),
    "EUR",
  );
});

test("priority 2: business.currency wins when menu missing", () => {
  assert.equal(
    resolveCurrency(null, { currency: "USD" }, [{ currency: "GBP" }]),
    "USD",
  );
  assert.equal(
    resolveCurrency({}, { currency: "USD" }, [{ currency: "GBP" }]),
    "USD",
  );
});

test("priority 3: first item with currency wins when both empty", () => {
  assert.equal(
    resolveCurrency(null, null, [{ currency: "GBP" }, { currency: "EUR" }]),
    "GBP",
  );
  // Items without currency are skipped over (find semantics).
  assert.equal(
    resolveCurrency(null, null, [{}, { currency: "EUR" }, { currency: "USD" }]),
    "EUR",
  );
});

test("priority 4: TRY is the TR market default", () => {
  assert.equal(resolveCurrency(null, null, null), DEFAULT_CURRENCY);
  assert.equal(resolveCurrency(null, null, []), DEFAULT_CURRENCY);
  assert.equal(resolveCurrency({}, {}, []), DEFAULT_CURRENCY);
  assert.equal(resolveCurrency(null, null, [{}, {}]), DEFAULT_CURRENCY);
  assert.equal(DEFAULT_CURRENCY, "TRY");
});

test("empty-string currency falls through", () => {
  // Defensive: an admin could clear the field in the future — we don't
  // want "" to be treated as a truthy currency code.
  assert.equal(
    resolveCurrency({ currency: "" }, { currency: "USD" }, []),
    "USD",
  );
  assert.equal(
    resolveCurrency({ currency: "" }, { currency: "" }, [{ currency: "" }]),
    "TRY",
  );
});

test("whitespace is trimmed and code is uppercased", () => {
  assert.equal(
    resolveCurrency({ currency: "  eur  " }, null, []),
    "EUR",
  );
});

test("oversize currency code is rejected (max 8 chars)", () => {
  // e.g. someone accidentally typed a long string into the admin field —
  // we should fall back rather than leak garbage into the cart.
  assert.equal(
    resolveCurrency({ currency: "VERY_LONG_CODE" }, null, []),
    "TRY",
  );
});

test("null + undefined + missing arrays are all safe", () => {
  // No throw, no NaN, always returns a string.
  for (const menu of [null, undefined, {}, { currency: undefined }]) {
    for (const business of [null, undefined, {}, { currency: null }]) {
      for (const items of [null, undefined, [], [{}, { currency: null }]]) {
        const result = resolveCurrency(menu, business, items);
        assert.equal(typeof result, "string");
        assert.ok(result.length > 0);
      }
    }
  }
});

test("read-only item array is accepted (defensive readonly contract)", () => {
  // MenuViewClient passes a `PublicMenuItem[]` typed as readonly in
  // some callers — the resolver must not require a mutable array.
  const items: readonly { currency?: string | null }[] = [
    { currency: "EUR" },
  ];
  assert.equal(resolveCurrency(null, null, items), "EUR");
});