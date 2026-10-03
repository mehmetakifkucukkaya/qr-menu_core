/**
 * Unit tests for `lib/media-url.ts`.
 *
 * Run via: cd apps/web && npm run test:media-url
 *
 * The rule under test: only a loopback host with a `/media/` path is rewritten
 * to a same-origin path (those URLs cannot work for anyone but the machine that
 * created them). Everything else must come back exactly as it went in.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { absoluteMediaUrl, mediaSrc } from "./media-url.ts";

test("empty input gives null", () => {
  assert.equal(mediaSrc(null), null);
  assert.equal(mediaSrc(undefined), null);
  assert.equal(mediaSrc(""), null);
});

test("relative paths, data and blob URLs are untouched", () => {
  assert.equal(mediaSrc("/media/tenants/cafe/image/a.jpg"), "/media/tenants/cafe/image/a.jpg");
  assert.equal(mediaSrc("data:image/svg+xml;base64,AAAA"), "data:image/svg+xml;base64,AAAA");
  assert.equal(mediaSrc("blob:http://localhost:3000/1234"), "blob:http://localhost:3000/1234");
});

test("a loopback origin on a /media/ path becomes a same-origin path", () => {
  assert.equal(
    mediaSrc("http://localhost:3000/media/uploads/1/abc-test.jpg"),
    "/media/uploads/1/abc-test.jpg",
  );
  assert.equal(
    mediaSrc("http://127.0.0.1:8000/media/tenants/cafe/image/a.jpg?v=2"),
    "/media/tenants/cafe/image/a.jpg?v=2",
  );
  assert.equal(mediaSrc("http://[::1]:8000/media/x.png"), "/media/x.png");
});

test("a loopback host with a path outside /media/ is left alone", () => {
  assert.equal(mediaSrc("http://localhost:3000/demo-assets/logo.webp"), "http://localhost:3000/demo-assets/logo.webp");
});

test("real hostnames are never rewritten, even on a /media/ path", () => {
  // The production origin and a CDN may legitimately carry /media/.
  assert.equal(mediaSrc("https://menu.example.com/media/a.jpg"), "https://menu.example.com/media/a.jpg");
  assert.equal(mediaSrc("https://cdn.example.com/media/a.jpg"), "https://cdn.example.com/media/a.jpg");
  assert.equal(mediaSrc("https://pub-abc.r2.dev/tenants/x/a.jpg"), "https://pub-abc.r2.dev/tenants/x/a.jpg");
});

test("look-alike hosts are not mistaken for loopback", () => {
  assert.equal(
    mediaSrc("http://localhost.evil.example/media/a.jpg"),
    "http://localhost.evil.example/media/a.jpg",
  );
  assert.equal(
    mediaSrc("http://127.0.0.1.evil.example/media/a.jpg"),
    "http://127.0.0.1.evil.example/media/a.jpg",
  );
});

test("garbage that is not a URL comes back unchanged", () => {
  assert.equal(mediaSrc("not a url"), "not a url");
});

test("absoluteMediaUrl resolves relative paths against the site origin", () => {
  assert.equal(
    absoluteMediaUrl("https://menu.example.com/", "/media/tenants/cafe/image/a.jpg"),
    "https://menu.example.com/media/tenants/cafe/image/a.jpg",
  );
  // A dev URL is first made relative, then resolved against the real origin.
  assert.equal(
    absoluteMediaUrl("https://menu.example.com", "http://localhost:3000/media/uploads/1/a.jpg"),
    "https://menu.example.com/media/uploads/1/a.jpg",
  );
  assert.equal(
    absoluteMediaUrl("https://menu.example.com", "https://cdn.example.com/a.jpg"),
    "https://cdn.example.com/a.jpg",
  );
  assert.equal(absoluteMediaUrl("https://menu.example.com", null), null);
});
