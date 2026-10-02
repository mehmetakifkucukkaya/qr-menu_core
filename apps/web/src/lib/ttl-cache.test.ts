/**
 * Unit tests for `lib/ttl-cache.ts` (ANALYSIS_1 F-05).
 *
 * Run via: cd apps/web && npm run test:ttl-cache
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { createTtlCache } from "./ttl-cache.ts";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("serves from cache inside the TTL and reloads after it", async () => {
  const c = clock();
  const cache = createTtlCache<number>({ now: c.now });
  let loads = 0;
  const loader = async () => ++loads;

  assert.equal(await cache.get("k", 10_000, loader), 1);
  c.advance(9_999);
  assert.equal(await cache.get("k", 10_000, loader), 1, "still fresh");
  assert.equal(loads, 1);

  c.advance(2);
  assert.equal(await cache.get("k", 10_000, loader), 2, "expired -> reloaded before answering");
  assert.equal(loads, 2);
});

test("never serves an expired value, even once (no stale-while-revalidate)", async () => {
  const c = clock();
  const cache = createTtlCache<string>({ now: c.now });
  let version = "price 10";
  const loader = async () => version;

  assert.equal(await cache.get("menu", 1_000, loader), "price 10");
  version = "price 12";
  c.advance(60 * 60 * 1000); // an hour of no traffic
  assert.equal(await cache.get("menu", 1_000, loader), "price 12");
});

test("concurrent requests for one key share a single load", async () => {
  const cache = createTtlCache<number>();
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const loader = async () => {
    loads += 1;
    await gate;
    return 42;
  };

  const all = Promise.all([cache.get("k", 1_000, loader), cache.get("k", 1_000, loader), cache.get("k", 1_000, loader)]);
  release();
  assert.deepEqual(await all, [42, 42, 42]);
  assert.equal(loads, 1);
});

test("failures are not cached and do not poison the key", async () => {
  const cache = createTtlCache<number>();
  let calls = 0;
  const flaky = async () => {
    calls += 1;
    if (calls === 1) throw new Error("backend down");
    return 7;
  };

  await assert.rejects(() => cache.get("k", 1_000, flaky), /backend down/);
  assert.equal(await cache.get("k", 1_000, flaky), 7);
  assert.equal(calls, 2);
});

test("ttl <= 0 disables caching entirely", async () => {
  const cache = createTtlCache<number>();
  let loads = 0;
  const loader = async () => ++loads;

  assert.equal(await cache.get("k", 0, loader), 1);
  assert.equal(await cache.get("k", 0, loader), 2);
  assert.equal(await cache.get("k", -5, loader), 3);
  assert.equal(cache.size(), 0);
});

test("keys are independent and the oldest entry is evicted past maxEntries", async () => {
  const cache = createTtlCache<string>({ maxEntries: 2 });
  await cache.get("a", 1_000, async () => "A");
  await cache.get("b", 1_000, async () => "B");
  await cache.get("c", 1_000, async () => "C");

  assert.equal(cache.size(), 2);
  let reloaded = false;
  await cache.get("a", 1_000, async () => {
    reloaded = true;
    return "A2";
  });
  assert.ok(reloaded, "the oldest key ('a') was evicted");
});
