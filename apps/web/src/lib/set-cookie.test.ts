/**
 * Unit tests for `lib/set-cookie.ts` (ANALYSIS_1 F-35).
 *
 * Run via: cd apps/web && npm run test:set-cookie
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSetCookie } from "./set-cookie.ts";

test("the session cookie keeps every security attribute", () => {
  const parsed = parseSetCookie(
    "qr_sessionid=abc123; expires=Wed, 04 Nov 2026 10:00:00 GMT; HttpOnly; Max-Age=2592000; Path=/; SameSite=Lax; Secure",
  );
  assert.ok(parsed);
  assert.equal(parsed.name, "qr_sessionid");
  assert.equal(parsed.value, "abc123");
  assert.deepEqual(parsed.options, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 2592000,
    expires: new Date("Wed, 04 Nov 2026 10:00:00 GMT"),
  });
});

test("the CSRF cookie is readable by scripts (no HttpOnly)", () => {
  const parsed = parseSetCookie("qr_csrftoken=tok; Max-Age=31449600; Path=/; SameSite=Lax");
  assert.ok(parsed);
  assert.equal(parsed.options.httpOnly, undefined);
  assert.equal(parsed.options.secure, undefined);
  assert.equal(parsed.options.maxAge, 31449600);
});

test("a value may contain '=' and attribute names are case-insensitive", () => {
  const parsed = parseSetCookie("tok=a=b==; httponly; SAMESITE=Strict; path=/admin");
  assert.ok(parsed);
  assert.equal(parsed.value, "a=b==");
  assert.equal(parsed.options.httpOnly, true);
  assert.equal(parsed.options.sameSite, "strict");
  assert.equal(parsed.options.path, "/admin");
});

test("Domain is dropped so the cookie stays on the frontend's host", () => {
  const parsed = parseSetCookie("qr_sessionid=x; Domain=api.example.com; Path=/");
  assert.ok(parsed);
  assert.equal("domain" in parsed.options, false);
});

test("a cleared cookie (Max-Age=0) is reported as such", () => {
  const parsed = parseSetCookie("qr_sessionid=; Max-Age=0; Path=/");
  assert.ok(parsed);
  assert.equal(parsed.value, "");
  assert.equal(parsed.options.maxAge, 0);
});

test("unknown attributes and bad numbers are ignored; junk returns null", () => {
  const parsed = parseSetCookie("a=b; Max-Age=soon; Priority=High; SameSite=Weird");
  assert.ok(parsed);
  assert.equal(parsed.options.maxAge, undefined);
  assert.equal(parsed.options.sameSite, undefined);
  assert.equal(parseSetCookie("no-equals-sign"), null);
  assert.equal(parseSetCookie("=novalue"), null);
  assert.equal(parseSetCookie(""), null);
});
