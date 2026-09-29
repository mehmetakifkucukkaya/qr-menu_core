/**
 * DOM bootstrap for component tests — Sprint C3b.
 *
 * Loaded via `node --import tsx --import ./src/test-dom.ts --test ...`
 * so that `@testing-library/react` finds a `document` global before
 * the first `render()` call. We deliberately keep this minimal:
 *   - jsdom window for `document`, `window`, `HTMLElement`, etc.
 *   - `TextEncoder` / `TextDecoder` shims for Node < 19 (Node 22+ has
 *     these globally but the shims are zero-cost on newer runtimes).
 *
 * V1 keeps the toolchain small: a single setup file, no Vitest / Jest
 * runner, no jsx-runtime config. Adding more tests should not require
 * editing this file.
 */

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

// Mirror the bits of `window` / `document` that React + RTL poke at.
const g = globalThis as Record<string, unknown>;
for (const key of [
  "window",
  "document",
  "navigator",
  "self",
  "HTMLElement",
  "HTMLAnchorElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLDivElement",
  "HTMLSpanElement",
  "HTMLFormElement",
  "Element",
  "Node",
  "NodeList",
  "DocumentFragment",
  "getComputedStyle",
  "DOMParser",
  "XMLSerializer",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "FocusEvent",
  "InputEvent",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "matchMedia",
]) {
  const value = (dom.window as unknown as Record<string, unknown>)[key];
  if (value !== undefined && !(key in g)) {
    g[key] = value;
  }
}
// jsdom does not implement requestIdleCallback; provide a no-op fallback
// so Next.js's <Link> use-intersection hook can run inside jsdom.
if (typeof g.requestIdleCallback !== "function") {
  g.requestIdleCallback = ((cb: IdleRequestCallback) => {
    const id = setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0);
    return id as unknown as number;
  }) as typeof window.requestIdleCallback;
  g.cancelIdleCallback = ((id: number) => {
    clearTimeout(id);
  }) as typeof window.cancelIdleCallback;
}
if (typeof g.matchMedia !== "function") {
  g.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
