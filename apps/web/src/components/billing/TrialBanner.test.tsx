/**
 * Unit tests for `components/billing/TrialBanner.tsx` — Sprint C3b.
 *
 * Uses Node 22+ built-in `node:test` runner with the
 * `--experimental-strip-types` flag (no Vitest/Jest in V1 frontend —
 * keep the toolchain small). Mirrors the test pattern established by
 * `lib/feature-flags.test.ts` and `lib/currency.test.ts`.
 *
 * React Testing Library is the only new dep. We deliberately render
 * the React component (rather than only testing `shouldRender()`) so
 * the tests catch regressions in:
 *   - the render branch the user sees (countdown text + CTA),
 *   - the inline variant (Card primitive + IconButton),
 *   - the dismiss handler wiring.
 *
 * Coverage matrix:
 *
 *   1. `shouldRender()` unit: false on null / in_trial=false / undefined;
 *      true on in_trial=true.
 *   2. Sticky variant renders the countdown + CTA when in_trial=true.
 *   3. Sticky variant renders nothing when in_trial=false.
 *   4. Sticky variant renders nothing when status=null.
 *   5. Inline variant renders the same countdown through Card.
 *   6. Dismiss handler fires when the X button is clicked.
 *
 * Run via:
 *   cd apps/web && node --experimental-strip-types --no-warnings=ExperimentalWarning \
 *     --test src/components/billing/TrialBanner.test.tsx
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "node:test";

import { TrialBanner, shouldRender } from "./TrialBanner.tsx";
import type { TrialStatus } from "@/lib/api-onboarding";
import type { PublicSettings } from "@/types/public";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SETTINGS_BASIC: PublicSettings = {
  slug: "my-cafe",
  name: "My Cafe",
  active_plan: "basic",
  features: {
    cart_enabled: false,
    orders_enabled: false,
    loyalty_enabled: false,
    customer_accounts_enabled: false,
    payments_enabled: false,
    ai_pdf_import_enabled: false,
    ai_translate_enabled: false,
    advanced_analytics_enabled: false,
  },
};

function makeStatus(overrides: Partial<TrialStatus> = {}): TrialStatus {
  return {
    in_trial: true,
    plan: "ops",
    trial_started_at: "2026-09-15T00:00:00Z",
    trial_ends_at: "2026-09-29T00:00:00Z",
    days_remaining: 13,
    ...overrides,
  };
}

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// 1. shouldRender() — pure helper
// ---------------------------------------------------------------------------

test("shouldRender: returns false on null status", () => {
  assert.equal(shouldRender(null), false);
});

test("shouldRender: returns false on undefined status", () => {
  assert.equal(shouldRender(undefined), false);
});

test("shouldRender: returns false when in_trial is false", () => {
  assert.equal(shouldRender(makeStatus({ in_trial: false })), false);
});

test("shouldRender: returns true when in_trial is true", () => {
  assert.equal(shouldRender(makeStatus({ in_trial: true })), true);
});

// ---------------------------------------------------------------------------
// 2-4. Sticky variant
// ---------------------------------------------------------------------------

test("sticky: renders countdown + CTA when in_trial is true", () => {
  const { getByTestId, queryByTestId } = render(
    <TrialBanner status={makeStatus({ days_remaining: 13 })} settings={SETTINGS_BASIC} />,
  );
  const banner = getByTestId("trial-banner-sticky");
  assert.ok(banner, "banner sticky root must be present");
  // Countdown renders the number + label.
  const countdown = getByTestId("trial-days-remaining");
  assert.equal(countdown.textContent, "13 gün kaldı");
  // CTA points at /admin/billing.
  const cta = getByTestId("trial-banner-cta");
  assert.equal(cta.getAttribute("href"), "/admin/billing");
  // No inline root in the sticky branch.
  assert.equal(queryByTestId("trial-banner-inline-headline"), null);
});

test("sticky: renders singular 'Son gün' when days_remaining is 0", () => {
  const { getByTestId } = render(
    <TrialBanner status={makeStatus({ days_remaining: 0 })} settings={SETTINGS_BASIC} />,
  );
  const countdown = getByTestId("trial-days-remaining");
  assert.equal(countdown.textContent, "Son gün");
});

test("sticky: hides entirely when in_trial is false", () => {
  const { queryByTestId } = render(
    <TrialBanner status={makeStatus({ in_trial: false })} settings={SETTINGS_BASIC} />,
  );
  assert.equal(queryByTestId("trial-banner-sticky"), null);
  assert.equal(queryByTestId("trial-days-remaining"), null);
  assert.equal(queryByTestId("trial-banner-cta"), null);
});

test("sticky: hides entirely when status is null", () => {
  const { queryByTestId } = render(
    <TrialBanner status={null} settings={SETTINGS_BASIC} />,
  );
  assert.equal(queryByTestId("trial-banner-sticky"), null);
});

// ---------------------------------------------------------------------------
// 5. Inline variant
// ---------------------------------------------------------------------------

test("inline: renders Card with countdown when in_trial is true", () => {
  const { getByTestId, queryByTestId } = render(
    <TrialBanner
      status={makeStatus({ days_remaining: 7 })}
      settings={SETTINGS_BASIC}
      variant="inline"
    />,
  );
  // The inline variant uses a separate testid for the headline to
  // disambiguate from the sticky branch.
  const headline = getByTestId("trial-banner-inline-headline");
  assert.ok(headline, "inline headline must be present");
  const countdown = getByTestId("trial-days-remaining");
  assert.equal(countdown.textContent, "7 gün kaldı");
  // No sticky root in the inline branch.
  assert.equal(queryByTestId("trial-banner-sticky"), null);
});

test("inline: hides entirely when in_trial is false", () => {
  const { queryByTestId } = render(
    <TrialBanner
      status={makeStatus({ in_trial: false })}
      settings={SETTINGS_BASIC}
      variant="inline"
    />,
  );
  assert.equal(queryByTestId("trial-banner-inline-headline"), null);
  assert.equal(queryByTestId("trial-days-remaining"), null);
});

// ---------------------------------------------------------------------------
// 6. Dismiss handler wiring
// ---------------------------------------------------------------------------

test("sticky: dismiss button fires onDismiss callback", () => {
  let dismissed = 0;
  const { getByTestId } = render(
    <TrialBanner
      status={makeStatus({ days_remaining: 13 })}
      settings={SETTINGS_BASIC}
      onDismiss={() => {
        dismissed += 1;
      }}
    />,
  );
  const dismiss = getByTestId("trial-banner-dismiss");
  fireEvent.click(dismiss);
  assert.equal(dismissed, 1);
});

test("sticky: dismiss button omitted when onDismiss is undefined", () => {
  const { queryByTestId } = render(
    <TrialBanner status={makeStatus({ days_remaining: 13 })} settings={SETTINGS_BASIC} />,
  );
  assert.equal(queryByTestId("trial-banner-dismiss"), null);
});
