/**
 * Unit tests for `KitchenClock` - the venue's time in the kitchen frame.
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { act, cleanup, render } from "@testing-library/react";

import { KitchenClock } from "./KitchenClock.tsx";

beforeEach(() => {
  // 11:32:40 UTC is 14:32:40 at the venue (Europe/Istanbul, UTC+3).
  mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.UTC(2026, 9, 5, 11, 32, 40) });
});
afterEach(() => {
  cleanup();
  mock.timers.reset();
});

test("it shows the venue's time, not the browser's", async () => {
  const { container } = render(<KitchenClock />);
  assert.equal(container.textContent, "14:32");
});

test("the minute moves on by itself", async () => {
  const { container } = render(<KitchenClock />);

  await act(async () => {
    mock.timers.tick(30_000); // 14:33:10
  });
  assert.equal(container.textContent, "14:33");
});

test("it is a <time> element, so a screen reader reads it as a time", () => {
  const { container } = render(<KitchenClock />);
  const time = container.querySelector("time") as HTMLTimeElement;
  assert.ok(time);
  assert.equal(time.getAttribute("datetime"), "2026-10-05T11:32:40.000Z");
});
