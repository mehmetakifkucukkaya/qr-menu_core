/**
 * Unit tests for `lib/datetime.ts`.
 *
 * Run via: cd apps/web && npm run test:datetime
 *
 * The point: the same instant reads the same on a UTC server and on any
 * visitor's machine, and it is Istanbul time (UTC+3, no daylight saving).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { DISPLAY_TIME_ZONE, formatDate, formatDateTime, formatTime } from "./datetime.ts";

// 21:30 UTC on 5 October is 00:30 on 6 October in Istanbul.
const LATE_EVENING_UTC = "2026-10-05T21:30:00Z";

test("the display zone is Istanbul", () => {
  assert.equal(DISPLAY_TIME_ZONE, "Europe/Istanbul");
});

test("date and time are converted to Istanbul, across midnight", () => {
  assert.equal(formatDateTime(LATE_EVENING_UTC), "06.10.2026 00:30");
  assert.equal(formatTime(LATE_EVENING_UTC), "00:30");
  assert.equal(formatDate(LATE_EVENING_UTC), "06.10.2026");
});

test("it does not depend on the machine's own time zone", () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = zone;
      assert.equal(formatDateTime(LATE_EVENING_UTC), "06.10.2026 00:30", zone);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("custom options replace the standard set", () => {
  // The separator of a year-less date differs between ICU versions ("06.10" /
  // "06/10"); the numbers and the time zone are what matter here.
  assert.match(
    formatDateTime(LATE_EVENING_UTC, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    /^06[./]10 00:30$/,
  );
});

test("empty options give the browser default, which includes seconds", () => {
  assert.equal(formatDateTime("2026-10-05T21:30:45Z", {}), "06.10.2026 00:30:45");
});

test("accepts Date objects and timestamps", () => {
  assert.equal(formatDateTime(new Date(LATE_EVENING_UTC)), "06.10.2026 00:30");
  assert.equal(formatDateTime(Date.parse(LATE_EVENING_UTC)), "06.10.2026 00:30");
});

test("missing or invalid input shows a dash instead of 'Invalid Date'", () => {
  for (const bad of [null, undefined, "", "not a date"]) {
    assert.equal(formatDateTime(bad as never), "—");
    assert.equal(formatDate(bad as never), "—");
    assert.equal(formatTime(bad as never), "—");
  }
});
