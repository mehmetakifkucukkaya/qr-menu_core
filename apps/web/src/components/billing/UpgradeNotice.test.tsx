/**
 * Unit tests for `components/billing/UpgradeNotice.tsx` + the two notice
 * stores.
 *
 * The banner is what an operator sees when the answer is "your plan":
 *
 *   * 402 `billing.limit_exceeded` — the tenant ran into a cap.
 *   * 403 `billing.feature_disabled` — the tenant asked for a module the
 *     plan does not carry.
 *
 * Before this the 402 had a banner and the 403 had nothing, so a module
 * the plan does not include surfaced as a line of text in whichever form
 * triggered it — or, on the kitchen screen, as a "connection lost" strip.
 *
 * Coverage matrix:
 *
 *   1. Nothing renders when nothing went wrong.
 *   2. The limit case names the limit and shows the used/limit numbers.
 *   3. The feature case says the module is not in the plan, in Turkish.
 *   4. The banner links to the plan page.
 *   5. The dismiss button clears the notice (whichever kind it is).
 *   6. The raw resource / flag name is never shown to the operator.
 *
 * Run via:
 *   cd apps/web && npm run test:upgrade-notice
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "node:test";

import { UpgradeNotice } from "./UpgradeNotice.tsx";
import { useFeatureNoticeStore } from "@/lib/stores/feature-notice";
import { limitLabel, useLimitNoticeStore } from "@/lib/stores/limit-notice";

afterEach(() => {
  cleanup();
  useLimitNoticeStore.getState().dismiss();
  useFeatureNoticeStore.getState().dismiss();
});

test("nothing renders when no plan problem was raised", () => {
  const { container } = render(<UpgradeNotice />);
  assert.equal(container.textContent, "");
});

test("the limit case names the limit and shows the numbers", () => {
  useLimitNoticeStore.getState().raise({
    resource: "items",
    current: 25,
    limit: 25,
    message: "'items' limiti doldu (25/25). Paket yükseltin.",
  });

  const { container } = render(<UpgradeNotice />);
  const text = container.textContent ?? "";
  assert.match(text, /Ürün/);
  assert.match(text, /25\/25/);
  assert.match(text, /limitiniz doldu/);
});

test("the feature case says the module is not in the plan", () => {
  useFeatureNoticeStore.getState().raise({
    feature: "orders_enabled",
    featureLabel: "Sipariş + mutfak",
    message: "'Sipariş + mutfak' özelliği planınızda kapalı.",
  });

  const { container } = render(<UpgradeNotice />);
  const text = container.textContent ?? "";
  assert.match(text, /Sipariş \+ mutfak/);
  assert.match(text, /planınızda kapalı/);
  assert.match(text, /yükselterek bu özelliği açabilirsiniz/);
});

test("the feature case falls back to the label when the server sent no sentence", () => {
  useFeatureNoticeStore.getState().raise({
    feature: "payments_enabled",
    featureLabel: "Online ödeme",
    message: "",
  });

  const { container } = render(<UpgradeNotice />);
  const text = container.textContent ?? "";
  assert.match(text, /Online ödeme/);
  assert.match(text, /planınızda kapalı/);
});

test("the banner links to the plan page", () => {
  useFeatureNoticeStore.getState().raise({
    feature: "ai_translate_enabled",
    featureLabel: "Çeviri",
    message: "'Çeviri' özelliği planınızda kapalı.",
  });

  const { container } = render(<UpgradeNotice />);
  const link = container.querySelector("a");
  assert.ok(link, "the banner has no link");
  assert.equal(link.getAttribute("href"), "/admin/billing");
});

test("the dismiss button clears the limit notice", () => {
  useLimitNoticeStore.getState().raise({
    resource: "locales",
    current: 3,
    limit: 2,
    message: "limit doldu",
  });

  const { container } = render(<UpgradeNotice />);
  assert.ok(container.textContent);

  const dismiss = container.querySelector("button[aria-label='Kapat']");
  assert.ok(dismiss, "the banner has no dismiss button");
  fireEvent.click(dismiss!);

  assert.equal(useLimitNoticeStore.getState().notice, null);
});

test("the dismiss button clears the feature notice", () => {
  useFeatureNoticeStore.getState().raise({
    feature: "orders_enabled",
    featureLabel: "Sipariş + mutfak",
    message: "'Sipariş + mutfak' özelliği planınızda kapalı.",
  });

  const { container } = render(<UpgradeNotice />);
  const dismiss = container.querySelector("button[aria-label='Kapat']");
  assert.ok(dismiss, "the banner has no dismiss button");
  fireEvent.click(dismiss!);

  assert.equal(useFeatureNoticeStore.getState().notice, null);
});

test("the raw resource name is never shown to the operator", () => {
  useLimitNoticeStore.getState().raise({
    resource: "ai_description_ops",
    current: 100,
    limit: 100,
    message: "limit doldu",
  });

  const { container } = render(<UpgradeNotice />);
  const text = container.textContent ?? "";
  assert.doesNotMatch(text, /ai_description_ops/);
  assert.match(text, /Aylık açıklama üretimi/);
});

test("the raw flag name is never shown to the operator", () => {
  useFeatureNoticeStore.getState().raise({
    feature: "ai_description_enabled",
    featureLabel: "Açıklama üretimi",
    message: "",
  });

  const { container } = render(<UpgradeNotice />);
  const text = container.textContent ?? "";
  assert.doesNotMatch(text, /ai_description_enabled/);
  assert.match(text, /Açıklama üretimi/);
});

test("an unknown resource falls back to its raw name", () => {
  assert.equal(limitLabel("something_new"), "something_new");
  assert.equal(limitLabel("locales"), "Dil");
});
