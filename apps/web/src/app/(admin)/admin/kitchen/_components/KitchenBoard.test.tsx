/**
 * Unit tests for `KitchenBoard` - the whole kitchen screen, with a fake server
 * behind `fetch`, a fake clock, and fake browser audio / wake lock / full screen.
 *
 * Run via: cd apps/web && npm run test:kitchen-ui
 */
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";

import type { KitchenBoard as KitchenBoardData, KitchenCard } from "@/lib/kitchen-board";

import { KitchenBoard } from "./KitchenBoard.tsx";

// ------------------------------------------------------------------ a fake server

interface Call {
  method: string;
  path: string;
  body: unknown;
  csrf: string | null;
}

let calls: Call[];
let serverBoard: KitchenBoardData;
let offline: boolean;
/** A test's own answer for a request (return `undefined` to let the default handle it). */
let respond: (call: Call) => Response | Promise<Response> | undefined;

function card(id: number, status: KitchenCard["status"] = "pending", extra: Partial<KitchenCard> = {}): KitchenCard {
  return {
    id,
    order_number: `CA-20261005-${String(id).padStart(3, "0")}`,
    daily_seq: id,
    status,
    table_number: "5",
    customer_name: "Ali",
    order_notes: "",
    placed_at: "2026-10-05T11:58:00Z",
    age_seconds: 30,
    is_stale: false,
    items: [{ id: id * 10, name: "Latte", quantity: 1, notes: "", allergens: [] }],
    ...extra,
  };
}

function boardOf(parts: { new?: number[]; preparing?: number[]; ready?: number[] }, truncated = false): KitchenBoardData {
  const make = (ids: number[] = [], status: KitchenCard["status"]) => ids.map((id) => card(id, status));
  const columns = {
    new: make(parts.new, "pending"),
    preparing: make(parts.preparing, "preparing"),
    ready: make(parts.ready, "ready"),
  };
  return {
    columns,
    counts: { new: columns.new.length, preparing: columns.preparing.length, ready: columns.ready.length },
    truncated,
    server_time: "2026-10-05T12:00:00Z",
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function installFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      csrf: headers["X-CSRFToken"] ?? null,
    };
    calls.push(call);
    if (offline) throw new TypeError("Failed to fetch");
    const custom = respond(call);
    if (custom) return custom;
    if (call.path === "/api/v1/admin/kitchen/board") return json({ data: serverBoard });
    if (/^\/api\/v1\/admin\/orders\/\d+\/status$/.test(call.path)) return json({ data: {} });
    return json({}, 404);
  }) as typeof fetch;
}

// ------------------------------------------------------------------ fake browser parts

let oscillators: number;
let audioContexts: number;
let audioClosed: number;
let wakeLocks: number;

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  constructor() {
    audioContexts += 1;
  }
  async resume() {}
  async close() {
    audioClosed += 1;
  }
  createOscillator() {
    oscillators += 1;
    return { type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
    };
  }
}

// ------------------------------------------------------------------ driving the screen

/** Let promises (the fake fetch, state updates) run; the fake clock does not touch setImmediate. */
async function settle() {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
}

async function advance(ms: number) {
  await act(async () => {
    mock.timers.tick(ms);
    await settle();
  });
}

async function mount(parts: Parameters<typeof boardOf>[0] | null, csrfToken: string | null = "tok") {
  serverBoard = boardOf(parts ?? {});
  const view = render(<KitchenBoard initialBoard={parts === null ? null : serverBoard} csrfToken={csrfToken} />);
  await act(async () => {
    await settle();
  });
  return view;
}

async function press(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
    await settle();
  });
}

const article = (view: ReturnType<typeof render>, name: string) => view.getByRole("article", { name });
const region = (view: ReturnType<typeof render>, name: string) => view.getByRole("region", { name });

beforeEach(() => {
  mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: Date.parse("2026-10-05T12:00:00Z") });
  calls = [];
  offline = false;
  respond = () => undefined;
  oscillators = audioContexts = audioClosed = wakeLocks = 0;
  installFetch();
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  Object.defineProperty(globalThis.navigator, "wakeLock", {
    configurable: true,
    value: {
      request: async () => {
        wakeLocks += 1;
        return { release: async () => {} };
      },
    },
  });
});

afterEach(() => {
  cleanup();
  mock.timers.reset();
});

// ------------------------------------------------------------------ what the screen shows

test("three columns with the real counts, the oldest order first, and no alarm for what was already waiting", async () => {
  const view = await mount({ new: [1, 2], preparing: [3], ready: [4] });

  for (const [name, count, titles] of [
    ["Yeni", "2", ["Sipariş #1, Masa 5", "Sipariş #2, Masa 5"]],
    ["Hazırlanıyor", "1", ["Sipariş #3, Masa 5"]],
    ["Hazır", "1", ["Sipariş #4, Masa 5"]],
  ] as const) {
    const column = region(view, name);
    assert.equal(within(column).getByRole("heading").textContent, `${name}${count}`);
    assert.deepEqual(
      within(column).getAllByRole("article").map((a) => a.getAttribute("aria-label")),
      titles,
    );
  }
  assert.equal(view.container.querySelectorAll('[data-alert="true"]').length, 0);
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].path, "/api/v1/admin/kitchen/board");
});

test("the title carries a live line whose time keeps moving, and turns to 'Bağlantı yok' when polls fail", async () => {
  const view = await mount({ new: [1] });
  const status = () => view.container.querySelector("[data-state]") as HTMLElement;

  assert.equal(status().textContent, "Canlı · son güncelleme 15:00:00");
  await advance(5_000);
  assert.equal(status().textContent, "Canlı · son güncelleme 15:00:05");

  offline = true;
  await advance(5_000);
  assert.equal(status().textContent, "Bağlantı yok");
  assert.equal(status().dataset.state, "offline");
});

test("an empty column says so, and the screen no longer promises instant notifications", async () => {
  const view = await mount({ new: [1] });

  assert.ok(within(region(view, "Hazır")).getByText("Sipariş yok"));
  assert.doesNotMatch(view.container.textContent ?? "", /anlık bildirim/i);
});

test("a board the server could not draw loads by itself", async () => {
  let release: () => void = () => {};
  respond = (call) =>
    call.path === "/api/v1/admin/kitchen/board"
      ? new Promise<Response>((resolve) => {
          release = () => resolve(json({ data: serverBoard }));
        })
      : undefined;

  const view = await mount(null);
  assert.ok(view.getByText("Siparişler yükleniyor…"));

  serverBoard = boardOf({ new: [1] });
  release();
  await act(async () => {
    await settle();
  });
  assert.ok(article(view, "Sipariş #1, Masa 5"));
  assert.equal(view.queryByText("Siparişler yükleniyor…"), null);
});

test("a board cut at the limit says how many are shown of how many", async () => {
  serverBoard = { ...boardOf({ new: [1, 2] }, true), counts: { new: 130, preparing: 0, ready: 0 } };
  const view = render(<KitchenBoard initialBoard={serverBoard} csrfToken="tok" />);
  await act(async () => {
    await settle();
  });

  assert.match(view.container.textContent ?? "", /Yalnızca en eski 2 sipariş gösteriliyor \(toplam 130\)/);
});

test("the age keeps counting between two polls", async () => {
  const view = await mount({ new: [1] });
  const age = () => (article(view, "Sipariş #1, Masa 5").querySelector("[data-tone]") as HTMLElement).textContent;

  assert.equal(age(), "0:30");
  await advance(3_000);
  assert.equal(age(), "0:33");
});

// ------------------------------------------------------------------ polling

test("every 5 seconds it asks again; a card that appears is new until somebody touches it", async () => {
  const view = await mount({ new: [1, 2] });
  const before = calls.length;

  serverBoard = boardOf({ new: [1, 2, 9] });
  await advance(4_999);
  assert.equal(calls.length, before, "not before 5 seconds");
  await advance(1);
  assert.equal(calls.length, before + 1);

  const fresh = article(view, "Sipariş #9, Masa 5");
  assert.equal(fresh.dataset.alert, "true");
  assert.equal(article(view, "Sipariş #1, Masa 5").dataset.alert, "false");

  await press(within(fresh).getByText("YENİ"));
  assert.equal(fresh.dataset.alert, "false");
});

test("coming back online or into view refreshes at once", async () => {
  await mount({ new: [1] });
  const before = calls.length;

  await act(async () => {
    window.dispatchEvent(new window.Event("online"));
    await settle();
  });
  assert.equal(calls.length, before + 1);

  await act(async () => {
    document.dispatchEvent(new window.Event("visibilitychange"));
    await settle();
  });
  assert.equal(calls.length, before + 2);
});

// ------------------------------------------------------------------ taps

test("'Hazırlamaya başla' asks for exactly that, with the CSRF token, and the board refreshes right away", async () => {
  const view = await mount({ new: [1, 2] });
  serverBoard = boardOf({ new: [2], preparing: [1] });

  await press(within(article(view, "Sipariş #1, Masa 5")).getByRole("button", { name: "Hazırlamaya başla" }));

  const post = calls.find((c) => c.method === "POST");
  assert.ok(post, "a status request was sent");
  assert.equal(post.path, "/api/v1/admin/orders/1/status");
  assert.deepEqual(post.body, { status: "preparing" });
  assert.equal(post.csrf, "tok");
  assert.equal(calls.at(-1)?.method, "GET", "the board was fetched again without waiting for the next tick");
  assert.ok(within(region(view, "Hazırlanıyor")).getByRole("article", { name: "Sipariş #1, Masa 5" }));
});

test("a signed-in tablet without a CSRF token in the page asks for one first", async () => {
  respond = (call) => (call.path === "/api/v1/auth/csrf" ? json({ csrfToken: "fresh-token" }) : undefined);
  const view = await mount({ new: [1] }, null);

  await press(within(article(view, "Sipariş #1, Masa 5")).getByRole("button", { name: "Hazırlamaya başla" }));

  assert.equal(calls.find((c) => c.method === "POST")?.csrf, "fresh-token");
});

test("while a tap is on its way that card's buttons are off", async () => {
  let release: () => void = () => {};
  respond = (call) =>
    call.method === "POST"
      ? new Promise<Response>((resolve) => {
          release = () => resolve(json({ data: {} }));
        })
      : undefined;
  const view = await mount({ new: [1] });
  const card1 = article(view, "Sipariş #1, Masa 5");

  await press(within(card1).getByRole("button", { name: "Hazırlamaya başla" }));
  const buttons = () => within(card1).getAllByRole("button") as HTMLButtonElement[];
  assert.ok(buttons().every((b) => b.disabled));

  release();
  await act(async () => {
    await settle();
  });
  assert.ok(buttons().every((b) => !b.disabled));
});

test("cancelling asks for a reason and sends it", async () => {
  const view = await mount({ new: [1] });
  serverBoard = boardOf({});

  await press(within(article(view, "Sipariş #1, Masa 5")).getByRole("button", { name: "İptal" }));
  const dialog = view.getByRole("dialog", { name: "Siparişi iptal et" });
  assert.equal(calls.filter((c) => c.method === "POST").length, 0, "nothing is sent before a reason is chosen");

  await press(within(dialog).getByRole("radio", { name: "Ürün tükendi" }));
  await press(within(dialog).getByRole("button", { name: "Siparişi iptal et" }));

  const post = calls.find((c) => c.method === "POST");
  assert.deepEqual(post?.body, { status: "cancelled", cancel_reason: "out_of_stock" });
  assert.equal(view.queryByRole("dialog"), null);
  assert.equal(view.queryByRole("article", { name: "Sipariş #1, Masa 5" }), null, "the card left the board");
});

test("when somebody else moved the order first, the server's message shows on the card and the board is refreshed", async () => {
  respond = (call) =>
    call.method === "POST"
      ? json({ error: { code: "order.invalid_transition", message: "Sipariş zaten teslim edildi." } }, 409)
      : undefined;
  const view = await mount({ ready: [4] });
  const before = calls.length;

  await press(within(article(view, "Sipariş #4, Masa 5")).getByRole("button", { name: "Teslim edildi" }));

  assert.equal(within(article(view, "Sipariş #4, Masa 5")).getByRole("alert").textContent, "Sipariş zaten teslim edildi.");
  assert.equal(calls.slice(before).at(-1)?.method, "GET", "it looked at the board again");
});

test("a tap that never reached the server says so, and does not claim the order moved", async () => {
  const view = await mount({ new: [1] });
  offline = true;

  await press(within(article(view, "Sipariş #1, Masa 5")).getByRole("button", { name: "Hazırlamaya başla" }));

  assert.match(within(article(view, "Sipariş #1, Masa 5")).getByRole("alert").textContent ?? "", /Bağlantı kurulamadı/);
});

// ------------------------------------------------------------------ connection

test("when the connection drops the last good orders stay and a strip says so; it goes when the connection is back", async () => {
  const view = await mount({ new: [1], preparing: [3] });

  offline = true;
  await advance(5_000);
  const banner = view.getByTestId("connection-banner");
  assert.match(banner.textContent ?? "", /Bağlantı yok · son güncelleme 15:00/);
  assert.ok(article(view, "Sipariş #1, Masa 5"), "the orders are still there");
  assert.ok(article(view, "Sipariş #3, Masa 5"));

  offline = false;
  await act(async () => {
    window.dispatchEvent(new window.Event("online"));
    await settle();
  });
  assert.equal(view.queryByTestId("connection-banner"), null);
});

test("failed polls are retried more slowly and the normal rhythm returns after the first success", async () => {
  await mount({ new: [1] });
  offline = true;
  await advance(5_000); // first failure
  const failed = calls.length;

  await advance(4_999);
  assert.equal(calls.length, failed, "the retry after one failure is 5 s later");
  await advance(1);
  assert.equal(calls.length, failed + 1); // second failure -> next retry in 10 s

  await advance(9_999);
  assert.equal(calls.length, failed + 1);
  offline = false;
  await advance(1);
  assert.equal(calls.length, failed + 2);
  await advance(5_000);
  assert.equal(calls.length, failed + 3, "5 s again");
});

test("an ended session says so instead of blaming the network", async () => {
  const view = await mount({ new: [1] });
  respond = (call) =>
    call.path === "/api/v1/admin/kitchen/board" ? json({ detail: "Authentication credentials were not provided." }, 401) : undefined;

  await advance(5_000);

  assert.match(view.getByRole("alert").textContent ?? "", /Oturumunuz sona erdi/);
  assert.equal(view.queryByTestId("connection-banner"), null);
  assert.ok(article(view, "Sipariş #1, Masa 5"), "the last orders stay visible");
});

// ------------------------------------------------------------------ the bell

test("a new order is silent until 'Servisi başlat' was tapped; after that it rings until the card is touched", async () => {
  const view = await mount({ new: [1] });

  // Service not started: the card is highlighted, nothing sounds.
  serverBoard = boardOf({ new: [1, 2] });
  await advance(5_000);
  assert.equal(article(view, "Sipariş #2, Masa 5").dataset.alert, "true");
  assert.equal(oscillators, 0);
  assert.equal(audioContexts, 0);

  // The tap that starts service unlocks the sound and asks for the wake lock;
  // the card that is still untouched rings at once.
  await press(view.getByRole("button", { name: "Servisi başlat" }));
  assert.equal(audioContexts, 1);
  assert.equal(wakeLocks, 1);
  assert.equal(oscillators, 2, "one chime = two notes");
  assert.ok(view.getByRole("button", { name: "Servisi bitir" }));

  // It repeats every 4 seconds...
  await advance(4_000);
  assert.equal(oscillators, 4);

  // ...until somebody touches the card.
  await press(within(article(view, "Sipariş #2, Masa 5")).getByText("YENİ"));
  await advance(12_000);
  assert.equal(oscillators, 4);
});

test("'Sessiz' keeps a new order quiet, and ending the service releases the sound", async () => {
  const view = await mount({ new: [1] });
  await press(view.getByRole("button", { name: "Servisi başlat" }));

  const mute = view.getByRole("button", { name: "Sessiz" });
  await press(mute);
  assert.equal(mute.getAttribute("aria-pressed"), "true");

  serverBoard = boardOf({ new: [1, 2] });
  await advance(5_000);
  assert.equal(article(view, "Sipariş #2, Masa 5").dataset.alert, "true");
  assert.equal(oscillators, 0, "highlighted but silent");

  await press(view.getByRole("button", { name: "Servisi bitir" }));
  assert.ok(view.getByRole("button", { name: "Servisi başlat" }));
  assert.equal(audioClosed, 1);
});

test("service also asks for full screen where the browser has it", async () => {
  const entered: string[] = [];
  const root = document.documentElement as unknown as { requestFullscreen?: () => Promise<void> };
  const doc = document as unknown as { exitFullscreen?: () => Promise<void> };
  root.requestFullscreen = async () => void entered.push("enter");
  doc.exitFullscreen = async () => void entered.push("exit");
  try {
    const view = await mount({ new: [1] });
    assert.equal(view.queryByRole("button", { name: "Tam ekran" }), null, "only once service runs");

    await press(view.getByRole("button", { name: "Servisi başlat" }));
    assert.deepEqual(entered, ["enter"]);
    assert.ok(view.getByRole("button", { name: "Tam ekran" }));
  } finally {
    delete root.requestFullscreen;
    delete doc.exitFullscreen;
  }
});
