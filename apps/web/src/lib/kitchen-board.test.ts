/**
 * Unit tests for `lib/kitchen-board.ts` - the pure rules of the kitchen screen:
 * how old an order feels, which cards are new, which button a card offers.
 *
 * Run via: cd apps/web && npm run test:kitchen-board
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  acknowledge,
  ageTone,
  cancelReasonLabel,
  canCancel,
  CANCEL_REASONS,
  cardTitle,
  formatAge,
  liveAge,
  nextAlertState,
  primaryActionFor,
  tableLabel,
  type AlertState,
  type KitchenBoard,
  type KitchenCard,
} from "./kitchen-board.ts";

function card(id: number, status: KitchenCard["status"] = "pending"): KitchenCard {
  return {
    id,
    order_number: `CA-20261005-${String(id).padStart(3, "0")}`,
    daily_seq: id,
    status,
    table_number: "5",
    customer_name: "Ali",
    order_notes: "",
    placed_at: "2026-10-05T12:00:00Z",
    age_seconds: 0,
    is_stale: false,
    items: [],
  };
}

function board(parts: { new?: number[]; preparing?: number[]; ready?: number[] }): KitchenBoard {
  const make = (ids: number[] = [], status: KitchenCard["status"]) => ids.map((id) => card(id, status));
  return {
    columns: {
      new: make(parts.new, "pending"),
      preparing: make(parts.preparing, "preparing"),
      ready: make(parts.ready, "ready"),
    },
    counts: {
      new: (parts.new ?? []).length,
      preparing: (parts.preparing ?? []).length,
      ready: (parts.ready ?? []).length,
    },
    truncated: false,
    server_time: "2026-10-05T12:00:00Z",
  };
}

const EMPTY: AlertState = { known: null, alerts: new Set() };

// ------------------------------------------------------------------ age

test("an order turns yellow after 10 minutes and red after 20", () => {
  assert.equal(ageTone(0), "ok");
  assert.equal(ageTone(599), "ok");
  assert.equal(ageTone(600), "warn");
  assert.equal(ageTone(1199), "warn");
  assert.equal(ageTone(1200), "late");
  assert.equal(ageTone(36 * 3600), "late");
});

test("an age reads as minutes and seconds, then hours", () => {
  assert.equal(formatAge(0), "0:00");
  assert.equal(formatAge(75), "1:15");
  assert.equal(formatAge(3599), "59:59");
  assert.equal(formatAge(3600), "1:00:00");
  assert.equal(formatAge(36 * 3600 + 125), "36:02:05");
  assert.equal(formatAge(-5), "0:00");
  assert.equal(formatAge(Number.NaN), "0:00");
});

test("the age keeps counting between two polls", () => {
  const received = 1_000_000;
  assert.equal(liveAge({ age_seconds: 100 }, received, received), 100);
  assert.equal(liveAge({ age_seconds: 100 }, received, received + 7_400), 107);
  assert.equal(liveAge({ age_seconds: 100 }, received, received - 5_000), 100, "a clock that went back never makes it younger");
});

// ------------------------------------------------------------------ what is new

test("the first board ever seen rings for nothing", () => {
  const state = nextAlertState(EMPTY, board({ new: [1, 2], preparing: [3] }));
  assert.deepEqual([...state.alerts], []);
  assert.deepEqual([...(state.known ?? [])].sort(), [1, 2, 3]);
});

test("a card that appears afterwards is new until somebody touches it", () => {
  let state = nextAlertState(EMPTY, board({ new: [1] }));
  state = nextAlertState(state, board({ new: [1, 2] }));
  assert.deepEqual([...state.alerts], [2]);

  state = nextAlertState(state, board({ new: [1, 2] })); // the next poll changes nothing
  assert.deepEqual([...state.alerts], [2]);

  state = acknowledge(state, [2]);
  assert.deepEqual([...state.alerts], []);
  state = nextAlertState(state, board({ new: [1, 2] }));
  assert.deepEqual([...state.alerts], [], "an acknowledged card does not ring again");
});

test("a new card that left the NEW column (started, cancelled, gone) stops asking for attention", () => {
  let state = nextAlertState(EMPTY, board({}));
  state = nextAlertState(state, board({ new: [7, 8] }));
  assert.deepEqual([...state.alerts].sort(), [7, 8]);

  state = nextAlertState(state, board({ new: [8], preparing: [7] })); // 7 was started on another tablet
  assert.deepEqual([...state.alerts], [8]);

  state = nextAlertState(state, board({ preparing: [7] })); // 8 was cancelled
  assert.deepEqual([...state.alerts], []);
});

test("an order that only moved column is not new again", () => {
  let state = nextAlertState(EMPTY, board({ preparing: [4] }));
  state = nextAlertState(state, board({ ready: [4] }));
  assert.deepEqual([...state.alerts], []);
});

// ------------------------------------------------------------------ buttons

test("each card offers the next step of the kitchen and nothing else", () => {
  assert.deepEqual(primaryActionFor("pending"), { to: "preparing", label: "Hazırlamaya başla" });
  assert.deepEqual(primaryActionFor("confirmed"), { to: "preparing", label: "Hazırlamaya başla" });
  assert.deepEqual(primaryActionFor("preparing"), { to: "ready", label: "Hazır" });
  assert.deepEqual(primaryActionFor("ready"), { to: "delivered", label: "Teslim edildi" });
});

test("only open orders can be cancelled", () => {
  for (const status of ["pending", "confirmed", "preparing"] as const) assert.equal(canCancel(status), true, status);
  assert.equal(canCancel("ready"), false);
});

test("the cancel reasons are the three the server accepts, in Turkish", () => {
  assert.deepEqual(
    CANCEL_REASONS.map((r) => r.value),
    ["out_of_stock", "kitchen_busy", "other"],
  );
  assert.equal(cancelReasonLabel("out_of_stock"), "Ürün tükendi");
  assert.equal(cancelReasonLabel("kitchen_busy"), "Mutfak yoğun");
  assert.equal(cancelReasonLabel("other"), "Diğer");
  assert.equal(cancelReasonLabel(null), null);
  assert.equal(cancelReasonLabel("???"), null);
});

test("a card is known by its short number of the day, or by its full number when it has none", () => {
  assert.equal(cardTitle({ daily_seq: 12, order_number: "CA-20261005-012" }), "#12");
  assert.equal(cardTitle({ daily_seq: null, order_number: "CA-20261005-012" }), "CA-20261005-012");
});

test("the table reads 'Masa 7', and 'Masa yok' when the customer gave none", () => {
  assert.equal(tableLabel({ table_number: "7" }), "Masa 7");
  assert.equal(tableLabel({ table_number: " B-3 " }), "Masa B-3");
  assert.equal(tableLabel({ table_number: "" }), "Masa yok");
  assert.equal(tableLabel({ table_number: "   " }), "Masa yok");
});
