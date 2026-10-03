/**
 * Unit tests for `lib/media-proxy.ts` — the path validation behind the public
 * `/media` proxy route.
 *
 * Run via: cd apps/web && npm run test:media-proxy
 *
 * The route is an unauthenticated file proxy, so these tests are mostly about
 * what it must REFUSE: traversal (plain and percent-encoded), path separators
 * smuggled through escapes, control characters, and anything that would leave
 * the configured backend.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isImageContentType, resolveMediaUpstream } from "./media-proxy.ts";

const BASE = "http://qrmenu-backend:8000";

test("a normal upload path maps onto the backend", () => {
  assert.equal(
    resolveMediaUpstream(BASE, "/media/uploads/1/3b38-test-photo.jpg")?.href,
    "http://qrmenu-backend:8000/media/uploads/1/3b38-test-photo.jpg",
  );
  assert.equal(
    resolveMediaUpstream(BASE, "/media/tenants/modern-cafe/image/abc.thumb.jpg")?.href,
    "http://qrmenu-backend:8000/media/tenants/modern-cafe/image/abc.thumb.jpg",
  );
});

test("a trailing slash on the base is harmless", () => {
  assert.equal(
    resolveMediaUpstream("http://localhost:8000/", "/media/a.jpg")?.href,
    "http://localhost:8000/media/a.jpg",
  );
});

test("percent-encoded names are forwarded as received, not double-encoded", () => {
  assert.equal(
    resolveMediaUpstream(BASE, "/media/uploads/1/su%20ve%20k%C3%B6pek.jpg")?.href,
    "http://qrmenu-backend:8000/media/uploads/1/su%20ve%20k%C3%B6pek.jpg",
  );
});

test("only paths under /media/ are accepted", () => {
  assert.equal(resolveMediaUpstream(BASE, "/media"), null);
  assert.equal(resolveMediaUpstream(BASE, "/media/"), null);
  assert.equal(resolveMediaUpstream(BASE, "/api/v1/admin/me"), null);
  assert.equal(resolveMediaUpstream(BASE, "/admin/dashboard"), null);
  assert.equal(resolveMediaUpstream(BASE, "/mediaX/a.jpg"), null);
});

test("directory traversal is refused in every spelling", () => {
  for (const evil of [
    "/media/../etc/passwd",
    "/media/uploads/../../secret",
    "/media/./a.jpg",
    "/media/%2e%2e/secret",
    "/media/%2E%2E/secret",
    "/media/uploads/%2e%2e%2fsecret",
    "/media/uploads/..%2fsecret",
    "/media/uploads/%2e/a.jpg",
  ]) {
    assert.equal(resolveMediaUpstream(BASE, evil), null, evil);
  }
});

test("slashes, backslashes and control characters smuggled through escapes are refused", () => {
  for (const evil of [
    "/media/uploads%2F1/a.jpg",
    "/media/uploads%5C1/a.jpg",
    "/media/uploads/1/a.jpg%00.png",
    "/media/uploads/1/a%0d%0aSet-Cookie:x.jpg",
    "/media/uploads/1/a%7f.jpg",
    "/media//evil.example/a.jpg",
    "/media/uploads//a.jpg",
    "/media/uploads/1/",
  ]) {
    assert.equal(resolveMediaUpstream(BASE, evil), null, evil);
  }
});

test("a malformed percent escape is refused, not thrown", () => {
  assert.equal(resolveMediaUpstream(BASE, "/media/uploads/%E0%A4%A.jpg"), null);
  assert.equal(resolveMediaUpstream(BASE, "/media/uploads/100%.jpg"), null);
});

test("oversized or too-deep paths are refused", () => {
  assert.equal(resolveMediaUpstream(BASE, `/media/${"a/".repeat(9)}x.jpg`), null);
  assert.equal(resolveMediaUpstream(BASE, `/media/${"a".repeat(500)}.jpg`), null);
});

test("a base that is not a URL gives null instead of throwing", () => {
  assert.equal(resolveMediaUpstream("not a url", "/media/a.jpg"), null);
});

test("the result can never leave the configured backend origin", () => {
  const url = resolveMediaUpstream(BASE, "/media/uploads/1/a.jpg");
  assert.equal(url?.origin, "http://qrmenu-backend:8000");
});

test("only image content types are served", () => {
  for (const ok of ["image/jpeg", "image/png", "image/webp", "image/jpeg; charset=binary", "IMAGE/PNG"]) {
    assert.equal(isImageContentType(ok), true, ok);
  }
  for (const no of ["application/pdf", "text/html", "image/svg+xml", "application/octet-stream", "", null]) {
    assert.equal(isImageContentType(no), false, String(no));
  }
});
