/**
 * Unit tests for the kitchen calls of `lib/api-admin.ts`: what the board request
 * and a status change put on the wire, and how a refusal reads.
 *
 * Run via: cd apps/web && npm run test:kitchen-api
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { AdminApiError, fetchKitchenBoard, updateOrderStatus } from "./api-admin.ts";

interface Call {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;
let calls: Call[];
let respond: (call: Call) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  respond = () => json({ data: {} });
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const BOARD = {
  columns: { new: [], preparing: [], ready: [] },
  counts: { new: 0, preparing: 0, ready: 0 },
  truncated: false,
  server_time: "2026-10-05T12:00:00Z",
};

test("the board is read from /kitchen/board with the session cookie and unwrapped", async () => {
  respond = () => json({ data: BOARD, meta: {} });
  const controller = new AbortController();

  const board = await fetchKitchenBoard({ baseUrl: "http://api.test", signal: controller.signal });

  assert.deepEqual(board, BOARD);
  assert.equal(calls[0].url, "http://api.test/api/v1/admin/kitchen/board");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.credentials, "include");
  assert.equal(calls[0].init.cache, "no-store");
  assert.equal(calls[0].init.signal, controller.signal, "the poller's timeout reaches fetch");
});

test("a server component reads the board with the forwarded cookies", async () => {
  respond = () => json({ data: BOARD });
  await fetchKitchenBoard({ internal: true, cookieHeader: "qr_sessionid=abc" });
  assert.equal((calls[0].init.headers as Record<string, string>).Cookie, "qr_sessionid=abc");
});

test("a status change posts the target and the CSRF token", async () => {
  respond = () => json({ data: { status: "preparing" } });

  await updateOrderStatus(42, "preparing", { baseUrl: "http://api.test", csrfToken: "tok" });

  assert.equal(calls[0].url, "http://api.test/api/v1/admin/orders/42/status");
  assert.equal(calls[0].init.method, "POST");
  assert.equal((calls[0].init.headers as Record<string, string>)["X-CSRFToken"], "tok");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { status: "preparing" });
});

test("a cancellation carries its reason", async () => {
  respond = () => json({ data: { status: "cancelled" } });

  await updateOrderStatus(7, "cancelled", {
    baseUrl: "http://api.test",
    csrfToken: "tok",
    cancelReason: "out_of_stock",
  });

  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    status: "cancelled",
    cancel_reason: "out_of_stock",
  });
});

test("a refused move reads as the server's Turkish sentence, with its HTTP status", async () => {
  respond = () =>
    json(
      { error: { code: "order.invalid_transition", message: "Geçersiz durum geçişi: sipariş şu an \"Hazır\"." } },
      409,
    );

  await assert.rejects(
    updateOrderStatus(7, "preparing", { baseUrl: "http://api.test", csrfToken: "tok" }),
    (error: unknown) => {
      assert.ok(error instanceof AdminApiError);
      assert.equal(error.status, 409);
      assert.equal(error.code, "order.invalid_transition");
      assert.match(error.message, /^Geçersiz durum geçişi/);
      return true;
    },
  );
});

test("a network failure is an AdminApiError with status 0", async () => {
  respond = () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(fetchKitchenBoard({ baseUrl: "http://api.test" }), (error: unknown) => {
    assert.ok(error instanceof AdminApiError);
    assert.equal(error.status, 0);
    assert.equal(error.code, "network.error");
    return true;
  });
});
