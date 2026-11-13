/**
 * Unit tests for `KitchenCard` - one order on the kitchen screen.
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import type { KitchenCard as KitchenCardData, KitchenTarget } from "@/lib/kitchen-board";

import { KitchenCard } from "./KitchenCard.tsx";

afterEach(cleanup);

function makeCard(overrides: Partial<KitchenCardData> = {}): KitchenCardData {
  return {
    id: 7,
    order_number: "CA-20261005-012",
    daily_seq: 12,
    status: "pending",
    table_number: "5",
    customer_name: "Ali Veli",
    order_notes: "Çocuk sandalyesi lazım",
    placed_at: "2026-10-05T12:00:00Z",
    age_seconds: 95,
    is_stale: false,
    items: [
      { id: 1, name: "Latte", quantity: 2, notes: "az şekerli", allergens: ["Süt Ürünleri"] },
      { id: 2, name: "Türk Kahvesi", quantity: 1, notes: "", allergens: [] },
    ],
    ...overrides,
  };
}

function renderCard(props: Partial<React.ComponentProps<typeof KitchenCard>> = {}) {
  const calls = {
    touch: [] as number[],
    advance: [] as Array<[number, KitchenTarget]>,
    cancel: [] as number[],
  };
  const card = props.card ?? makeCard();
  const view = render(
    <KitchenCard
      card={card}
      ageSeconds={95}
      isNew={false}
      busy={false}
      error={null}
      onTouch={(c) => calls.touch.push(c.id)}
      onAdvance={(c, to) => calls.advance.push([c.id, to])}
      onCancel={(c) => calls.cancel.push(c.id)}
      {...props}
    />,
  );
  return { ...view, calls, article: view.getByRole("article") };
}

test("the card shows the short number, table, age, every line with its note and allergens, and the order note", () => {
  const { article } = renderCard();
  const card = within(article);

  assert.ok(card.getByText("#12"));
  assert.ok(card.getByText("Masa 5"));
  assert.ok(card.getByText("CA-20261005-012", { exact: false }));
  assert.ok(card.getByText("Ali Veli", { exact: false }));
  assert.ok(card.getByText("1:35"), "the age as minutes:seconds");

  assert.ok(card.getByText("Latte"));
  assert.ok(card.getByText("2×"));
  assert.ok(card.getByText("az şekerli"));
  assert.ok(card.getByText("Süt Ürünleri"));
  assert.ok(card.getByText("Türk Kahvesi"));
  assert.ok(card.getByText("Çocuk sandalyesi lazım", { exact: false }));
  assert.equal(article.getAttribute("aria-label"), "Sipariş #12, Masa 5");
});

test("an order from before the daily number existed is known by its full number; no table says so", () => {
  const { article } = renderCard({ card: makeCard({ daily_seq: null, table_number: "" }) });
  assert.equal(article.getAttribute("aria-label"), "Sipariş CA-20261005-012, Masa yok");
  assert.ok(within(article).getByText("Masa yok"));
});

test("an order that was left open from an earlier day says 'Dünden'", () => {
  const today = renderCard();
  assert.equal(within(today.article).queryByText("Dünden"), null);
  cleanup();

  const stale = renderCard({ card: makeCard({ is_stale: true }) });
  assert.ok(within(stale.article).getByText("Dünden"));
});

test("the age turns yellow after 10 minutes and red after 20, and says so in words too", () => {
  const read = (seconds: number) => {
    const view = renderCard({ ageSeconds: seconds });
    const age = view.article.querySelector("[data-tone]") as HTMLElement;
    const result = { tone: age.dataset.tone, text: age.textContent ?? "" };
    cleanup();
    return result;
  };

  assert.equal(read(599).tone, "ok");
  assert.equal(read(600).tone, "warn");
  assert.equal(read(1199).tone, "warn");
  assert.equal(read(1200).tone, "late");
  assert.match(read(1200).text, /Geç kaldı/);
  assert.match(read(700).text, /Uzadı/);
  assert.match(read(1200).text, /20:00/);
});

test("only a new card is highlighted, with a label as well as a colour", () => {
  const calm = renderCard();
  assert.equal(calm.article.dataset.alert, "false");
  assert.equal(within(calm.article).queryByText("YENİ"), null);
  cleanup();

  const fresh = renderCard({ isNew: true });
  assert.equal(fresh.article.dataset.alert, "true");
  assert.ok(within(fresh.article).getByText("YENİ"));
  assert.match(fresh.article.className, /kitchen-card-alert/);
});

test("each status offers its one big button, and a tap asks for the next step", () => {
  const cases: Array<[KitchenCardData["status"], string, KitchenTarget]> = [
    ["pending", "Hazırlamaya başla", "preparing"],
    ["confirmed", "Hazırlamaya başla", "preparing"],
    ["preparing", "Hazır", "ready"],
    ["ready", "Teslim edildi", "delivered"],
  ];
  for (const [status, label, target] of cases) {
    const { article, calls } = renderCard({ card: makeCard({ status }) });
    fireEvent.click(within(article).getByRole("button", { name: label }));
    assert.deepEqual(calls.advance, [[7, target]], `${status} -> ${target}`);
    cleanup();
  }
});

test("an open order can be cancelled, a ready one cannot", () => {
  const open = renderCard({ card: makeCard({ status: "preparing" }) });
  fireEvent.click(within(open.article).getByRole("button", { name: "İptal" }));
  assert.deepEqual(open.calls.cancel, [7]);
  cleanup();

  const ready = renderCard({ card: makeCard({ status: "ready" }) });
  assert.equal(within(ready.article).queryByRole("button", { name: "İptal" }), null);
});

test("while a request is in flight both buttons are off, so a tap cannot be sent twice", () => {
  const { article, calls } = renderCard({ busy: true });
  const buttons = within(article).getAllByRole("button") as HTMLButtonElement[];

  assert.equal(buttons.length, 2);
  assert.ok(buttons.every((b) => b.disabled));
  buttons.forEach((b) => fireEvent.click(b));
  assert.deepEqual(calls.advance, []);
  assert.deepEqual(calls.cancel, []);
});

test("when the server refuses a tap its message is shown on that card", () => {
  const { article } = renderCard({ error: "Bu sipariş zaten teslim edildi." });
  const alert = within(article).getByRole("alert");
  assert.equal(alert.textContent, "Bu sipariş zaten teslim edildi.");
});

test("touching the card anywhere reports it, so the bell for it stops", () => {
  const { article, calls } = renderCard({ isNew: true });
  fireEvent.click(within(article).getByText("Latte"));
  assert.deepEqual(calls.touch, [7]);

  fireEvent.click(within(article).getByRole("button", { name: "Hazırlamaya başla" }));
  assert.deepEqual(calls.touch, [7, 7], "a tap on the button is a touch as well");
});

test("the card never shows a phone number, even if one were sent along", () => {
  const leaky = { ...makeCard(), customer_phone: "+90 555 123 45 67" } as KitchenCardData;
  const { article } = renderCard({ card: leaky });

  assert.doesNotMatch(article.textContent ?? "", /555/);
  assert.doesNotMatch(article.innerHTML, /555/);
});

test("nothing on the card is smaller than 16 px, and every button is at least 48 px tall", () => {
  const { article } = renderCard({ isNew: true, error: "Hata" });

  const classes = [article, ...Array.from(article.querySelectorAll("*"))]
    .map((el) => el.getAttribute("class") ?? "")
    .join(" ");
  assert.doesNotMatch(classes, /\btext-(xs|sm)\b|\btext-\[(\d|1[0-5])px\]/, "text must be at least 16 px");
  for (const button of Array.from(article.querySelectorAll("button"))) {
    assert.match(button.className, /\bmin-h-(12|14)\b/, "a button must be at least 48 px tall");
  }
});
