/**
 * Guards the kitchen screen's own palette (SPEC_PILOT_READINESS 5.5): a dark,
 * high-contrast set of design tokens that applies only below an element with the
 * `.kitchen-dark` class (there is no global dark mode switch), complete enough
 * that no light colour leaks through, and strong enough to read on a wall tablet.
 *
 * Reads the real stylesheets, so a token that is renamed or a colour that is
 * softened fails here instead of on a tablet.
 *
 * Run via: cd apps/web && npm run test:kitchen-theme
 */
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const tokens = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

/** The custom properties declared in the first rule whose selector starts with `selector`. */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} is missing`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const found = new Map<string, string>();
  for (const match of css.slice(open + 1, close).matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    found.set(match[1], match[2].trim());
  }
  return found;
}

const light = declarations(tokens, ":root,");
const dark = declarations(tokens, ".kitchen-dark");

function rgb(name: string): Rgb {
  const value = dark.get(`--color-${name}`);
  assert.ok(value, `--color-${name} is missing from .kitchen-dark`);
  const parts = value.split(/\s+/).map(Number);
  assert.equal(parts.length, 3, `--color-${name} is not an RGB triplet: ${value}`);
  return parts as Rgb;
}

/** WCAG 2.1 relative luminance and contrast ratio. */
function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("the palette redefines every colour token, so no light colour shows through", () => {
  const colourTokens = [...light.entries()]
    .filter(([name, value]) => name.startsWith("--color-") && /^\d+ \d+ \d+$/.test(value))
    .map(([name]) => name);
  assert.ok(colourTokens.length >= 25, "the light palette was not parsed");

  const missing = colourTokens.filter((name) => !dark.has(name));
  assert.deepEqual(missing, []);
});

test("it asks the browser for dark form controls and scrollbars too", () => {
  const start = tokens.indexOf(".kitchen-dark");
  const body = tokens.slice(tokens.indexOf("{", start) + 1, tokens.indexOf("}", start));
  assert.match(body, /color-scheme:\s*dark;/);
});

test("all text reads at AAA contrast (7:1) on the screen and on its cards", () => {
  for (const ground of ["background", "surface", "surface-low"]) {
    for (const ink of ["text", "muted", "outline", "primary", "secondary", "danger", "success", "warning"]) {
      const ratio = contrast(ink, ground);
      assert.ok(ratio >= 7, `${ink} on ${ground} is only ${ratio.toFixed(1)}:1`);
    }
  }
});

test("coloured notes (allergens, line notes, the cancel row) and button labels are readable as well", () => {
  const pairs: Array<[ink: string, ground: string]> = [
    ["warning", "warning-soft"],
    ["danger", "danger-soft"],
    ["success", "success-soft"],
    ["primary", "primary-soft"],
    ["secondary", "secondary-soft"],
    ["text", "surface-high"],
    // the big buttons: dark label on a bright fill
    ["background", "warning"],
    ["background", "success"],
    ["background", "danger"],
    ["primary-foreground", "primary"],
  ];
  for (const [ink, ground] of pairs) {
    const ratio = contrast(ink, ground);
    assert.ok(ratio >= 7, `${ink} on ${ground} is only ${ratio.toFixed(1)}:1`);
  }
});

test("a control's border can be seen against the card (3:1)", () => {
  assert.ok(contrast("input", "surface") >= 3);
  assert.ok(contrast("input", "background") >= 3);
});

test("a new card pulses, and the pulse stops for people who asked for less motion", () => {
  assert.match(globals, /\.kitchen-card-alert\s*\{[^}]*animation:\s*kitchen-alert/);
  assert.match(globals, /@keyframes kitchen-alert/);

  const reduced = globals.slice(globals.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.kitchen-card-alert\s*\{\s*animation:\s*none;/);
});
