/**
 * Unit tests for the plan-notice path of `lib/api-admin.ts`: the two answers
 * that mean "your plan is the problem" and the stores they reach.
 *
 *   * 402 `billing.limit_exceeded`   → the limit-notice store
 *   * 403 `billing.feature_disabled` → the feature-notice store
 *
 * The 402 path existed but was never tested end to end — the store was
 * filled in production by hand. Both are tested here now, because the
 * banner is only as good as the hand-off: a notice that never reaches the
 * store is a banner that never appears.
 *
 * Run via:
 *   cd apps/web && npm run test:api-plan-notices
 */
import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { AdminApiError, fetchKitchenBoard } from "./api-admin.ts";
import { useFeatureNoticeStore } from "./stores/feature-notice.ts";
import { useLimitNoticeStore } from "./stores/limit-notice.ts";

const realFetch = globalThis.fetch;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  globalThis.fetch = (async () =>
    json({ data: {} })) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  useLimitNoticeStore.getState().dismiss();
  useFeatureNoticeStore.getState().dismiss();
});

/** The store is filled in a lazily imported module — give it a tick. */
async function settle() {
  for (let i = 0; i < 3; i++) await new Promise((resolve) => setImmediate(resolve));
}

test("a 403 'not in your plan' reaches the feature-notice store", async () => {
  globalThis.fetch = (async () =>
    json(
      {
        error: {
          code: "billing.feature_disabled",
          message: "'Sipariş + mutfak' özelliği planınızda kapalı.",
          feature: "orders_enabled",
          feature_label: "Sipariş + mutfak",
        },
        meta: { request_id: "" },
      },
      403,
    )) as typeof fetch;

  await assert.rejects(
    fetchKitchenBoard({ baseUrl: "http://api.test" }),
    (error: unknown) => error instanceof AdminApiError && error.status === 403,
  );
  await settle();

  const notice = useFeatureNoticeStore.getState().notice;
  assert.ok(notice, "the feature notice never reached the store");
  assert.equal(notice.feature, "orders_enabled");
  assert.equal(notice.featureLabel, "Sipariş + mutfak");
  assert.match(notice.message, /planınızda kapalı/);
});

test("a 402 'your plan is too small' reaches the limit-notice store", async () => {
  globalThis.fetch = (async () =>
    json(
      {
        error: {
          code: "billing.limit_exceeded",
          message: "'items' limiti doldu (25/25). Paket yükseltin.",
          resource: "items",
          current: 25,
          limit: 25,
        },
        meta: { request_id: "" },
      },
      402,
    )) as typeof fetch;

  await assert.rejects(fetchKitchenBoard({ baseUrl: "http://api.test" }));
  await settle();

  const notice = useLimitNoticeStore.getState().notice;
  assert.ok(notice, "the limit notice never reached the store");
  assert.equal(notice.resource, "items");
  assert.equal(notice.current, 25);
  assert.equal(notice.limit, 25);
});

test("a 403 that is not about the plan says nothing about the plan", async () => {
  globalThis.fetch = (async () =>
    json({ detail: "Yetkiniz yok." }, 403)) as typeof fetch;

  await assert.rejects(fetchKitchenBoard({ baseUrl: "http://api.test" }));
  await settle();

  assert.equal(
    useFeatureNoticeStore.getState().notice,
    null,
    "a permission problem is not a plan problem",
  );
});
