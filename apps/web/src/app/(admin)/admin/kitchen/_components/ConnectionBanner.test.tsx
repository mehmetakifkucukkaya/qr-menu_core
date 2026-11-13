/**
 * Unit tests for `ConnectionBanner` - the strip that says the kitchen screen has
 * lost its connection (the last good orders stay on screen below it).
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, render } from "@testing-library/react";

import { ConnectionBanner } from "./ConnectionBanner.tsx";

afterEach(cleanup);

// 11:32 UTC is 14:32 at the venue (Europe/Istanbul, UTC+3).
const LAST_UPDATE = Date.UTC(2026, 9, 5, 11, 32, 40);

test("a healthy connection shows nothing", () => {
  const { container } = render(<ConnectionBanner failures={0} lastUpdateMs={LAST_UPDATE} sessionEnded={false} />);
  assert.equal(container.textContent, "");
});

test("a lost connection says so and when the screen last updated, in the venue's time", () => {
  const { getByTestId } = render(
    <ConnectionBanner failures={2} lastUpdateMs={LAST_UPDATE} sessionEnded={false} />,
  );
  const banner = getByTestId("connection-banner");

  assert.match(banner.textContent ?? "", /Bağlantı yok · son güncelleme 14:32/);
  assert.match(banner.textContent ?? "", /son alınan siparişler/);
  assert.equal(banner.getAttribute("role"), "status");
});

test("without any update yet it shows a dash instead of a time", () => {
  const { getByTestId } = render(<ConnectionBanner failures={1} lastUpdateMs={null} sessionEnded={false} />);
  assert.match(getByTestId("connection-banner").textContent ?? "", /son güncelleme —/);
});

test("a session that ended asks for a new sign-in instead of blaming the network", () => {
  const { getByRole, queryByTestId } = render(
    <ConnectionBanner failures={1} lastUpdateMs={LAST_UPDATE} sessionEnded />,
  );

  assert.match(getByRole("alert").textContent ?? "", /Oturumunuz sona erdi/);
  const link = getByRole("link", { name: "Yeniden giriş yap" });
  assert.equal(link.getAttribute("href"), "/login?next=/admin/kitchen");
  assert.equal(queryByTestId("connection-banner"), null);
});

test("the strip is readable from a metre away: text of 16 px or more, a link 48 px high", () => {
  const { container } = render(<ConnectionBanner failures={1} lastUpdateMs={LAST_UPDATE} sessionEnded />);
  const classes = Array.from(container.querySelectorAll("*"))
    .map((el) => el.getAttribute("class") ?? "")
    .join(" ");
  assert.doesNotMatch(classes, /\btext-(xs|sm)\b/);
  assert.match((container.querySelector("a") as HTMLElement).className, /\bmin-h-12\b/);
});
