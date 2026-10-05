/**
 * Unit tests for `CartLineNote` - the optional note a customer writes for one
 * line of the cart ("şekersiz"); it reaches the kitchen card.
 *
 * Run via: cd apps/web && npm run test:cart-note
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";

import { CartLineNote } from "./CartLineNote.tsx";

afterEach(cleanup);

function setup(value = "") {
  const typed: string[] = [];
  const view = render(<CartLineNote itemName="Latte" value={value} onChange={(next) => typed.push(next)} />);
  return { ...view, typed, input: view.getByRole("textbox", { name: "Latte için not" }) as HTMLInputElement };
}

test("the field is named after its dish and invites a short note", () => {
  const { input } = setup();
  assert.equal(input.getAttribute("placeholder"), "Ürüne not (ör. şekersiz)");
  assert.equal(input.type, "text");
});

test("typing reports the note", () => {
  const { input, typed } = setup();
  fireEvent.change(input, { target: { value: "az şekerli" } });
  assert.deepEqual(typed, ["az şekerli"]);
});

test("the browser stops at 120 characters, which is also what the server accepts", () => {
  const { input } = setup();
  assert.equal(input.maxLength, 120);
});

test("it shows the saved note, and a counter only when the limit is near", () => {
  const short = setup("az şekerli");
  assert.equal(short.input.value, "az şekerli");
  assert.equal(short.queryByText(/\/120/), null);
  cleanup();

  const long = setup("x".repeat(105));
  assert.ok(long.getByText("105/120"));
});

test("the counter does not become part of the field's name", () => {
  const { getByRole } = setup("x".repeat(110));
  const input = getByRole("textbox", { name: "Latte için not" });
  const counter = document.getElementById(input.getAttribute("aria-describedby") ?? "");
  assert.equal(counter?.textContent, "110/120", "it describes the field instead");
});

test("the field is 16 px text, so a phone does not zoom in on it", () => {
  const { input } = setup();
  assert.match(input.className, /\btext-base\b/);
  assert.doesNotMatch(input.className, /\btext-(xs|sm)\b/);
});
