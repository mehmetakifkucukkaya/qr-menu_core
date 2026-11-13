/**
 * Unit tests for `components/signup/Step5SuccessQR.tsx` — the wizard's
 * final screen.
 *
 * The bug this file locks down: the success screen rendered as soon as
 * the wizard reached step 5, while `completeOnboarding` was still in
 * flight. The write was fire-and-forget, so "Hesabınız hazır" could be
 * on screen while the tenant had no menu at all — and the "Menü önizleme"
 * link on that screen led to a 404. It surfaced as a flaky browser test
 * in CI: the write landed before the test navigated on a retry, and lost
 * the race on the first attempt.
 *
 * A failed write was worse: it only reached `console.error`, so the
 * operator was told everything was fine while their menu did not exist.
 *
 * Coverage matrix:
 *
 *   1. While the write is in flight the success screen is NOT shown.
 *   2. When the write lands, the success screen appears.
 *   3. A failed write shows the error — and the success screen does not.
 *   4. "Tekrar dene" re-runs the write.
 *
 * Run via:
 *   cd apps/web && npm run test:signup-step5
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";

import React from "react";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { Step5SuccessQR } from "./Step5SuccessQR.tsx";
import { useSignupWizard } from "@/lib/stores/signup-wizard";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * The component calls `useRouter()`, which needs the Next.js app router
 * context. The context object is what Next.js itself provides, so the
 * test wraps the component in the same provider the framework uses —
 * no module mocking, no stubbed hooks.
 */
function renderStep5() {
  const router = {
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
  return render(
    <AppRouterContext.Provider value={router as never}>
      <Step5SuccessQR />
    </AppRouterContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Stub `fetch` for the two calls this component makes:
 *   - GET  /api/v1/auth/csrf   → the CSRF token
 *   - POST /api/v1/onboarding/complete → the write itself
 *
 * `complete` decides what the write does: "ok", "fail" or "hold" (never
 * settles, so the pending state can be observed).
 */
function stubFetch(opts: { complete: "ok" | "fail" | "hold" }) {
  const original = globalThis.fetch;
  const calls: { url: string; method: string }[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });

    if (url.includes("/api/v1/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken: "test-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/v1/onboarding/complete")) {
      if (opts.complete === "hold") {
        // Never settles: the "still saving" state stays on screen.
        return new Promise<Response>(() => {});
      }
      if (opts.complete === "fail") {
        return new Response(
          JSON.stringify({ error: { code: "boom", message: "Menü kaydedilemedi." } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ menu_id: 1, category_id: 1, items: 1 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("{}", {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  return {
    calls,
    completeCalls: () =>
      calls.filter((c) => c.url.includes("/api/v1/onboarding/complete")),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Put the wizard in the state step 5 renders: a category and an item. */
function seedWizard() {
  useSignupWizard.getState().updateForm({
    email: "owner@example.com",
    password: "Sifre-123456!",
    full_name: "Cafe Sahibi",
    business_name: "Demo Cafe",
    slug: "demo-cafe",
    first_category: { name: "Kahvaltı", icon: "🍽️", order: 0 },
    first_items: [
      { name: "Menemen", price: "85.00", description: "" },
      { name: "", price: "", description: "" },
    ],
  });
  useSignupWizard.getState().setStep(5);
}

beforeEach(() => {
  useSignupWizard.getState().reset();
  seedWizard();
});

afterEach(() => {
  cleanup();
  useSignupWizard.getState().reset();
});

// ---------------------------------------------------------------------------
// 1-2. The success screen waits for the write
// ---------------------------------------------------------------------------

test("the success screen is not shown while the write is in flight", async () => {
  const stub = stubFetch({ complete: "hold" });
  try {
    const { container } = renderStep5();

    await waitFor(() => {
      assert.ok(container.querySelector('[data-testid="onboarding-saving"]'));
    });

    assert.doesNotMatch(container.textContent ?? "", /Hesabınız hazır/);
    // The preview link would lead to a menu that does not exist yet.
    assert.doesNotMatch(container.textContent ?? "", /Menü önizleme/);
  } finally {
    stub.restore();
  }
});

test("the success screen appears once the write lands", async () => {
  const stub = stubFetch({ complete: "ok" });
  try {
    const { container } = renderStep5();

    await waitFor(() => {
      assert.match(container.textContent ?? "", /Hesabınız hazır/);
    });

    assert.equal(stub.completeCalls().length, 1);
    assert.match(container.textContent ?? "", /Menü önizleme/);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// 3. A failed write is visible
// ---------------------------------------------------------------------------

test("a failed write shows the error instead of the success screen", async () => {
  const stub = stubFetch({ complete: "fail" });
  try {
    const { container } = renderStep5();

    await waitFor(() => {
      assert.ok(container.querySelector('[data-testid="onboarding-error"]'));
    });

    assert.doesNotMatch(container.textContent ?? "", /Hesabınız hazır/);
    assert.match(container.textContent ?? "", /Menü oluşturulamadı/);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// 4. The retry button re-runs the write
// ---------------------------------------------------------------------------

test("'Tekrar dene' re-runs the write", async () => {
  const stub = stubFetch({ complete: "fail" });
  try {
    const { container } = renderStep5();

    await waitFor(() => {
      assert.ok(container.querySelector('[data-testid="onboarding-error"]'));
    });

    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.includes("Tekrar dene"),
    );
    assert.ok(retry, "the error state has no retry button");

    fireEvent.click(retry!);

    await waitFor(() => {
      assert.equal(stub.completeCalls().length, 2);
    });
  } finally {
    stub.restore();
  }
});
