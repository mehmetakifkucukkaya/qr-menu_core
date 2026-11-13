/**
 * Unit tests for `OrderCancelledNotice` - what the customer's order page says
 * when the kitchen cancelled the order, now with the reason.
 *
 * Run via: cd apps/web && npm run test:cart-note
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, render } from "@testing-library/react";

import { OrderCancelledNotice } from "./OrderCancelledNotice.tsx";

afterEach(cleanup);

test("it says the order was cancelled, when, and why", () => {
  const { getByText, container } = render(
    <ul>
      <OrderCancelledNotice cancelledAt="2026-10-05T11:32:40Z" reasonLabel="Ürün tükendi" />
    </ul>,
  );

  assert.ok(getByText("İptal Edildi"));
  assert.match(container.textContent ?? "", /Sipariş iptal edildi · 05[./]10 14:32\./);
  assert.ok(getByText("Neden: Ürün tükendi"));
});

test("an order cancelled before reasons existed has no reason line", () => {
  const { queryByText, container } = render(
    <ul>
      <OrderCancelledNotice cancelledAt={null} reasonLabel={null} />
    </ul>,
  );

  assert.equal(queryByText(/Neden:/), null);
  assert.match(container.textContent ?? "", /Sipariş iptal edildi\./);
});
