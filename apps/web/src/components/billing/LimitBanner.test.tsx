/**
 * Unit tests for `components/billing/LimitBanner.tsx` + the limit-notice
 * store.
 *
 * The banner is what an operator sees when the backend answers 402
 * ("your plan is too small"). It used to not exist: the 402 was a line
 * of text in whichever form triggered it, and on the analytics page a
 * generic error that said "try again" — which was wrong, because
 * retrying never helps once a cap is reached.
 *
 * Coverage matrix:
 *
 *   1. Nothing renders when there is no notice.
 *   2. The banner names the limit and shows the used/limit numbers.
 *   3. The banner links to the plan page.
 *   4. The dismiss button clears the notice.
 *   5. The raw resource name is never shown to the operator.
 *
 * Run via:
 *   cd apps/web && npm run test:limit-banner
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "node:test";

import { LimitBanner } from "./LimitBanner.tsx";
import { limitLabel, useLimitNoticeStore } from "@/lib/stores/limit-notice";

afterEach(() => {
  cleanup();
  useLimitNoticeStore.getState().dismiss();
});

test("nothing renders when no limit was reached", () => {
  const { container } = render(<LimitBanner />);
  assert.equal(container.textContent, "");
});

test("the banner names the limit and shows the numbers", () => {
  useLimitNoticeStore.getState().raise({
    resource: "items",
    current: 25,
    limit: 25,
    message: "'items' limiti doldu (25/25). Paket yükseltin.",
  });

  const { container } = render(<LimitBanner />);
  const text = container.textContent ?? "";
  assert.match(text, /Ürün/);
  assert.match(text, /25\/25/);
  assert.match(text, /limitiniz doldu/);
});

test("the banner links to the plan page", () => {
  useLimitNoticeStore.getState().raise({
    resource: "ai_translate_ops",
    current: 100,
    limit: 100,
    message: "aylık kullanım limiti doldu",
  });

  const { container } = render(<LimitBanner />);
  const link = container.querySelector("a");
  assert.ok(link, "the banner has no link");
  assert.equal(link.getAttribute("href"), "/admin/billing");
});

test("the dismiss button clears the notice", () => {
  useLimitNoticeStore.getState().raise({
    resource: "locales",
    current: 3,
    limit: 2,
    message: "limit doldu",
  });

  const { container } = render(<LimitBanner />);
  assert.ok(container.textContent);

  const dismiss = container.querySelector("button[aria-label='Kapat']");
  assert.ok(dismiss, "the banner has no dismiss button");
  fireEvent.click(dismiss!);

  assert.equal(useLimitNoticeStore.getState().notice, null);
});

test("the raw resource name is never shown to the operator", () => {
  useLimitNoticeStore.getState().raise({
    resource: "ai_description_ops",
    current: 100,
    limit: 100,
    message: "limit doldu",
  });

  const { container } = render(<LimitBanner />);
  const text = container.textContent ?? "";
  assert.doesNotMatch(text, /ai_description_ops/);
  assert.match(text, /Aylık açıklama üretimi/);
});

test("an unknown resource falls back to its raw name", () => {
  assert.equal(limitLabel("something_new"), "something_new");
  assert.equal(limitLabel("locales"), "Dil");
});
