/**
 * Unit tests for `CancelDialog` - the cook picks why an order is cancelled
 * (the customer reads the reason on the order page).
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";

import type { CancelReason, KitchenCard } from "@/lib/kitchen-board";

import { CancelDialog } from "./CancelDialog.tsx";

afterEach(cleanup);

function makeCard(id = 7): KitchenCard {
  return {
    id,
    order_number: `CA-20261005-0${id}`,
    daily_seq: id,
    status: "pending",
    table_number: "5",
    customer_name: "Ali",
    order_notes: "",
    placed_at: "2026-10-05T12:00:00Z",
    age_seconds: 30,
    is_stale: false,
    items: [],
  };
}

function setup(card: KitchenCard | null = makeCard()) {
  const confirmed: CancelReason[] = [];
  let closed = 0;
  const props = { onConfirm: (reason: CancelReason) => confirmed.push(reason), onClose: () => (closed += 1) };
  const view = render(<CancelDialog card={card} {...props} />);
  return { ...view, confirmed, closes: () => closed, props };
}

test("with no card the dialog is closed and shows nothing", () => {
  const { container, queryByRole } = setup(null);
  assert.equal(queryByRole("dialog"), null);
  assert.equal(container.querySelector("form"), null);
});

test("it names the order and offers the three reasons the server accepts", () => {
  const { getByRole, getAllByRole } = setup();
  const dialog = getByRole("dialog", { name: "Siparişi iptal et" });

  assert.match(dialog.textContent ?? "", /#7 · Masa 5/);
  const labels = getAllByRole("radio").map((r) => (r.closest("label") as HTMLElement).textContent);
  assert.deepEqual(labels, ["Ürün tükendi", "Mutfak yoğun", "Diğer"]);
});

test("the order cannot be cancelled until a reason is chosen", () => {
  const { getByRole, confirmed } = setup();
  const confirm = getByRole("button", { name: "Siparişi iptal et" }) as HTMLButtonElement;

  assert.equal(confirm.disabled, true);
  fireEvent.click(confirm);
  assert.deepEqual(confirmed, []);

  fireEvent.click(getByRole("radio", { name: "Ürün tükendi" }));
  assert.equal(confirm.disabled, false);
  fireEvent.click(confirm);
  assert.deepEqual(confirmed, ["out_of_stock"]);
});

test("each choice maps to its reason code", () => {
  for (const [label, code] of [
    ["Mutfak yoğun", "kitchen_busy"],
    ["Diğer", "other"],
  ] as const) {
    const { getByRole, confirmed } = setup();
    fireEvent.click(getByRole("radio", { name: label }));
    fireEvent.click(getByRole("button", { name: "Siparişi iptal et" }));
    assert.deepEqual(confirmed, [code]);
    cleanup();
  }
});

test("'Vazgeç' closes it without cancelling anything", () => {
  const { getByRole, confirmed, closes } = setup();
  fireEvent.click(getByRole("button", { name: "Vazgeç" }));
  assert.equal(closes(), 1);
  assert.deepEqual(confirmed, []);
});

test("another order starts again without a reason chosen", () => {
  const { getByRole, rerender, props } = setup(makeCard(7));
  fireEvent.click(getByRole("radio", { name: "Mutfak yoğun" }));

  rerender(<CancelDialog card={makeCard(8)} {...props} />);

  assert.equal((getByRole("radio", { name: "Mutfak yoğun" }) as HTMLInputElement).checked, false);
  assert.equal((getByRole("button", { name: "Siparişi iptal et" }) as HTMLButtonElement).disabled, true);
});

test("the choices are big enough to hit and to read", () => {
  const { getByRole } = setup();
  const classes = Array.from(getByRole("dialog").querySelectorAll("*"))
    .map((el) => el.getAttribute("class") ?? "")
    .join(" ");
  assert.doesNotMatch(classes, /\btext-(xs|sm)\b/);
  for (const label of Array.from(getByRole("dialog").querySelectorAll("label"))) {
    assert.match(label.className, /\bmin-h-14\b/);
  }
  for (const button of Array.from(getByRole("dialog").querySelectorAll("button"))) {
    assert.match(button.className, /\bmin-h-14\b/);
  }
});
