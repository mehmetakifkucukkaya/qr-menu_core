/**
 * Unit tests for `components/signup/Step1BusinessInfo.tsx` — the first
 * step of the self-serve signup wizard.
 *
 * The bug this file locks down: the slug availability check is
 * debounced by 300ms, and the submit handler used to bail out with a
 * bare `return` while the check was still in flight:
 *
 *   if (slugStatus.kind === "checking") return;
 *
 * The button did nothing — no error, no spinner, no network call. A
 * fast operator (or an automated browser) that typed a slug and
 * immediately hit "Devam et" sat on step 1 forever. It showed up in
 * CI as a flaky e2e failure: the test passed when it ran alone (the
 * check had finished by then) and failed inside the full suite, where
 * the machine was busier.
 *
 * The fix waits for the in-flight check instead of dropping the click,
 * and still blocks the submit when the check says the slug is taken.
 *
 * Coverage matrix:
 *
 *   1. A click that lands while the check is in flight still signs up.
 *   2. A slug the check reports as taken blocks the submit and says why.
 *   3. A free slug goes through and the wizard advances to step 2.
 *   4. The auto-slug suggestion never overwrites a slug the operator typed.
 *
 * Run via:
 *   cd apps/web && npm run test:signup-step1
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { afterEach, beforeEach } from "node:test";

import React from "react";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";

import { Step1BusinessInfo } from "./Step1BusinessInfo.tsx";
import { useSignupWizard } from "@/lib/stores/signup-wizard";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Call = { url: string; method: string; body: unknown };

/**
 * Stub `fetch` so the component's real code path runs (the admin client
 * unwraps the envelope, the wizard debounces, the submit waits).
 *
 * `checkSlug` decides what /api/v1/auth/check-slug answers:
 *   - "free"  → 200 { available: true, reason: "" }
 *   - "taken" → 200 { available: false, reason: "taken" }
 *   - "slow"  → the answer is delayed, so a click can land mid-check
 */
function stubFetch(opts: { checkSlug: "free" | "taken" | "slow" }) {
  const calls: Call[] = [];
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });

    if (url.includes("/api/v1/auth/check-slug")) {
      if (opts.checkSlug === "slow") {
        // Long enough that a click right after the typing reliably lands
        // while the check is still in flight.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return new Response(
        JSON.stringify({
          slug: "demo-cafe",
          available: opts.checkSlug !== "taken",
          reason: opts.checkSlug === "taken" ? "taken" : "",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (url.includes("/api/v1/auth/signup")) {
      return new Response(
        JSON.stringify({
          user: {
            id: 1,
            email: "owner@example.com",
            full_name: "Cafe Sahibi",
            role: "owner",
            is_active: true,
            is_staff: false,
            is_superuser: false,
            date_joined: "2026-01-01T00:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
          },
          organization: {
            id: 1,
            slug: "demo-cafe",
            name: "Demo Cafe",
            default_locale: "tr",
            supported_locales: ["tr"],
            currency: "TRY",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response("{}", {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  return {
    calls,
    signupCalls: () =>
      calls.filter((c) => c.url.includes("/api/v1/auth/signup")),
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Fill the form the way an operator would. */
function fillForm(container: HTMLElement) {
  const set = (labelText: string, value: string) => {
    const input = [...container.querySelectorAll("input")].find((el) => {
      const id = el.getAttribute("id");
      if (!id) return false;
      const label = container.querySelector(`label[for="${id}"]`);
      return label?.textContent?.replace("*", "").trim() === labelText;
    });
    assert.ok(input, `no input labelled "${labelText}"`);
    fireEvent.change(input!, { target: { value } });
  };

  set("Email", "owner@example.com");
  set("Şifre", "Sifre-123456!");
  set("Ad Soyad", "Cafe Sahibi");
  set("İşletme Adı", "Demo Cafe");
  set("Slug (URL)", "demo-cafe");
}

function submitButton(container: HTMLElement): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.type === "submit",
  );
  assert.ok(button, "the form has no submit button");
  return button as HTMLButtonElement;
}

beforeEach(() => {
  useSignupWizard.getState().reset();
});

afterEach(() => {
  cleanup();
  useSignupWizard.getState().reset();
});

// ---------------------------------------------------------------------------
// 1. The regression: a click during the in-flight check must not be dropped
// ---------------------------------------------------------------------------

test("a click that lands while the slug check is in flight still signs up", async () => {
  const stub = stubFetch({ checkSlug: "slow" });
  try {
    const { container } = render(<Step1BusinessInfo />);
    fillForm(container);

    // The slug was just typed — the debounce timer has not fired yet, so
    // the check is still "checking" when the click lands.
    fireEvent.click(submitButton(container));

    // The submit waits for the check and then goes through.
    await waitFor(() => {
      assert.equal(stub.signupCalls().length, 1);
    });

    assert.equal(useSignupWizard.getState().currentStep, 2);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// 2. A slug the check reports as taken still blocks the submit
// ---------------------------------------------------------------------------

test("a slug the check reports as taken blocks the submit and says why", async () => {
  const stub = stubFetch({ checkSlug: "taken" });
  try {
    const { container } = render(<Step1BusinessInfo />);
    fillForm(container);

    fireEvent.click(submitButton(container));

    await waitFor(() => {
      assert.match(container.textContent ?? "", /kullanılamaz/);
    });

    assert.equal(stub.signupCalls().length, 0);
    assert.equal(useSignupWizard.getState().currentStep, 1);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// 3. The happy path advances the wizard
// ---------------------------------------------------------------------------

test("a free slug signs up and advances the wizard to step 2", async () => {
  const stub = stubFetch({ checkSlug: "free" });
  try {
    const { container } = render(<Step1BusinessInfo />);
    fillForm(container);

    fireEvent.click(submitButton(container));

    await waitFor(() => {
      assert.equal(stub.signupCalls().length, 1);
    });

    const sent = stub.signupCalls()[0]!.body as Record<string, unknown>;
    assert.equal(sent.email, "owner@example.com");
    assert.equal(sent.slug, "demo-cafe");
    assert.equal(useSignupWizard.getState().currentStep, 2);
  } finally {
    stub.restore();
  }
});

// ---------------------------------------------------------------------------
// 4. The auto-slug suggestion never overwrites a slug the operator typed
// ---------------------------------------------------------------------------

test("the auto-slug suggestion does not overwrite a slug the operator typed", async () => {
  const stub = stubFetch({ checkSlug: "free" });
  try {
    const { container } = render(<Step1BusinessInfo />);

    const inputs = [...container.querySelectorAll("input")];
    const business = inputs.find((el) => el.getAttribute("name") === "business_name");
    const slug = inputs.find((el) => el.getAttribute("name") === "slug");
    assert.ok(business && slug);

    // The operator types the business name, then moves to the slug field
    // and writes their own slug. The blur on the business name fires
    // the suggestion — it must not land in the slug field.
    fireEvent.change(business!, { target: { value: "E2E Cafe" } });
    fireEvent.focus(slug!);
    fireEvent.change(slug!, { target: { value: "e2e-cafe-abc123" } });
    fireEvent.blur(business!);

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(
      (slug as HTMLInputElement).value,
      "e2e-cafe-abc123",
      "the auto-slug suggestion overwrote the operator's slug",
    );
  } finally {
    stub.restore();
  }
});
