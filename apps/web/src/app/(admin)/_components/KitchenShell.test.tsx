/**
 * Unit tests for `KitchenShell` - the frame a kitchen tablet gets instead of the
 * admin sidebar: the business, the time, a way out, and nothing to wander off to.
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, render } from "@testing-library/react";

import { KitchenShell } from "./KitchenShell.tsx";

beforeEach(() => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.UTC(2026, 9, 5, 11, 32, 40) });
  // React 18 (the test runner's copy) warns about a function as <form action>;
  // Next accepts it for server actions.
  mock.method(console, "error", () => {});
});
afterEach(() => {
  cleanup();
  mock.timers.reset();
  mock.restoreAll();
});

function renderShell() {
  return render(
    <KitchenShell businessName="Modern Cafe" logoutAction={() => {}}>
      <p>the board</p>
    </KitchenShell>,
  );
}

test("the frame shows the business, the time and a sign-out button around the page", () => {
  const view = renderShell();

  assert.ok(view.getByText("Modern Cafe"));
  assert.ok(view.getByText("14:32"));
  const signOut = view.getByRole("button", { name: "Çıkış yap" });
  assert.equal(signOut.closest("form")?.tagName, "FORM");
  assert.ok(view.getByText("the board"));
  assert.equal(view.getByRole("main").id, "main-content");
});

test("there is no navigation to wander off with: a kitchen tablet shows the kitchen", () => {
  const view = renderShell();
  assert.equal(view.queryByRole("navigation"), null);
  assert.equal(view.queryAllByRole("link").length, 0);
});

test("the frame wears the kitchen palette and fills the screen", () => {
  const { container } = renderShell();
  const root = container.firstElementChild as HTMLElement;

  assert.match(root.className, /\bkitchen-dark\b/);
  assert.match(root.className, /\bmin-h-screen\b/);
  assert.match(root.className, /\bbg-background\b/);
});

test("the sign-out button is big enough to hit and its text to read", () => {
  const view = renderShell();
  assert.match(view.getByRole("button", { name: "Çıkış yap" }).className, /\bmin-h-12\b/);
  assert.doesNotMatch(view.container.innerHTML, /\btext-(xs|sm)\b/);
});
