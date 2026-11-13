/**
 * Unit tests for `LiveStatus` - the line under the kitchen screen's title that
 * proves the screen is alive: a frozen board and a quiet kitchen look the same,
 * a clock that keeps moving tells them apart.
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, render } from "@testing-library/react";

import { LiveStatus } from "./LiveStatus.tsx";

afterEach(cleanup);

// 11:32:40 UTC is 14:32:40 at the venue (Europe/Istanbul, UTC+3).
const LAST_UPDATE = Date.UTC(2026, 9, 5, 11, 32, 40);

test("before the first update it says it is connecting", () => {
  const { container } = render(<LiveStatus failures={0} lastUpdateMs={null} />);
  const line = container.firstElementChild as HTMLElement;

  assert.equal(line.textContent, "Bağlanıyor…");
  assert.equal(line.dataset.state, "connecting");
});

test("a live screen shows the second of its last update, in the venue's time", () => {
  const { container } = render(<LiveStatus failures={0} lastUpdateMs={LAST_UPDATE} />);
  const line = container.firstElementChild as HTMLElement;

  assert.equal(line.textContent, "Canlı · son güncelleme 14:32:40");
  assert.equal(line.dataset.state, "live");
});

test("after a failed poll it says the connection is gone (the strip below gives the details)", () => {
  const { container } = render(<LiveStatus failures={3} lastUpdateMs={LAST_UPDATE} />);
  const line = container.firstElementChild as HTMLElement;

  assert.equal(line.textContent, "Bağlantı yok");
  assert.equal(line.dataset.state, "offline");
  assert.match(line.className, /text-danger/);
});

test("it is readable from a distance: at least 16 px", () => {
  const { container } = render(<LiveStatus failures={0} lastUpdateMs={LAST_UPDATE} />);
  assert.doesNotMatch(container.innerHTML, /\btext-(xs|sm)\b/);
});
