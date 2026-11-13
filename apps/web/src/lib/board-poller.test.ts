/**
 * Unit tests for `lib/board-poller.ts` - the loop that keeps the kitchen board
 * fresh: every 5 s, an 8 s timeout, back-off after failures, immediate refresh
 * on demand, and a clean stop.
 *
 * Run via: cd apps/web && npm run test:board-poller
 */
import { afterEach, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import { BoardPoller } from "./board-poller.ts";

/** Let the promise chains of the poller run (the fake timers do not touch them). */
async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

async function tick(ms: number) {
  mock.timers.tick(ms);
  await settle();
}

interface Harness {
  poller: BoardPoller<string>;
  calls: AbortSignal[];
  data: Array<{ value: string; at: number }>;
  errors: Array<{ failures: number }>;
  resolveNext: (value: string) => Promise<void>;
  rejectNext: () => Promise<void>;
}

function harness(): Harness {
  const calls: AbortSignal[] = [];
  const waiting: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = [];
  const data: Harness["data"] = [];
  const errors: Harness["errors"] = [];
  const poller = new BoardPoller<string>({
    fetchBoard: (signal) => {
      calls.push(signal);
      return new Promise<string>((resolve, reject) => {
        waiting.push({ resolve, reject });
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
    onData: (value, at) => data.push({ value, at }),
    onError: (_error, failures) => errors.push({ failures }),
    now: () => Date.now(),
  });
  return {
    poller,
    calls,
    data,
    errors,
    resolveNext: async (value) => {
      waiting.shift()?.resolve(value);
      await settle();
    },
    rejectNext: async () => {
      waiting.shift()?.reject(new Error("offline"));
      await settle();
    },
  };
}

beforeEach(() => mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000 }));
afterEach(() => mock.timers.reset());

test("it fetches at once and then every 5 seconds", async () => {
  const h = harness();
  h.poller.start();
  assert.equal(h.calls.length, 1);

  await h.resolveNext("a");
  assert.deepEqual(h.data, [{ value: "a", at: 1_000 }]);

  await tick(4_999);
  assert.equal(h.calls.length, 1);
  await tick(1);
  assert.equal(h.calls.length, 2);

  await h.resolveNext("b");
  await tick(5_000);
  assert.equal(h.calls.length, 3);
  h.poller.stop();
});

test("failures back off 5 s, 10 s, 20 s, then 30 s, and are counted", async () => {
  const h = harness();
  h.poller.start();

  const waits = [5_000, 10_000, 20_000, 30_000, 30_000];
  for (const [i, wait] of waits.entries()) {
    await h.rejectNext();
    assert.equal(h.errors.length, i + 1);
    assert.equal(h.errors[i].failures, i + 1);
    assert.equal(h.poller.consecutiveFailures, i + 1);
    await tick(wait - 1);
    assert.equal(h.calls.length, i + 1, `no retry before ${wait} ms`);
    await tick(1);
    assert.equal(h.calls.length, i + 2, `retry after ${wait} ms`);
  }
  h.poller.stop();
});

test("a success after failures goes back to the normal rhythm", async () => {
  const h = harness();
  h.poller.start();
  await h.rejectNext();
  await tick(5_000);
  await h.rejectNext();
  assert.equal(h.poller.consecutiveFailures, 2);
  await tick(10_000);

  await h.resolveNext("back");
  assert.equal(h.poller.consecutiveFailures, 0);
  assert.equal(h.data.at(-1)?.value, "back");

  const before = h.calls.length;
  await tick(5_000);
  assert.equal(h.calls.length, before + 1);
  h.poller.stop();
});

test("a request that hangs is given up after 8 seconds and counts as a failure", async () => {
  const h = harness();
  h.poller.start();
  assert.equal(h.calls[0].aborted, false);

  await tick(7_999);
  assert.equal(h.calls[0].aborted, false);
  await tick(1);

  assert.equal(h.calls[0].aborted, true);
  assert.equal(h.errors.length, 1);
  assert.equal(h.poller.consecutiveFailures, 1);
  h.poller.stop();
});

test("refreshNow fetches immediately instead of waiting for the timer", async () => {
  const h = harness();
  h.poller.start();
  await h.resolveNext("a");

  h.poller.refreshNow();
  assert.equal(h.calls.length, 2);
  await h.resolveNext("b");
  assert.equal(h.data.at(-1)?.value, "b");

  // ...and the normal 5 s rhythm restarts from that fetch.
  await tick(4_999);
  assert.equal(h.calls.length, 2);
  await tick(1);
  assert.equal(h.calls.length, 3);
  h.poller.stop();
});

test("refreshNow while a request is in flight asks for one more right after it, not two at once", async () => {
  const h = harness();
  h.poller.start();
  h.poller.refreshNow();
  h.poller.refreshNow();
  assert.equal(h.calls.length, 1);

  await h.resolveNext("a");
  assert.equal(h.calls.length, 2, "one follow-up, however many times it was asked for");
  await h.resolveNext("b");
  h.poller.stop();
});

test("stop cancels the request in flight, ignores its late answer and starts nothing again", async () => {
  const h = harness();
  h.poller.start();
  h.poller.stop();

  assert.equal(h.calls[0].aborted, true);
  await settle();
  assert.deepEqual(h.data, []);
  assert.deepEqual(h.errors, [], "an aborted request after stop is not a failure to report");

  await tick(60_000);
  assert.equal(h.calls.length, 1);
});
