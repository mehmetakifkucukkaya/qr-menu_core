/**
 * Unit tests for `lib/seo.ts` — Sprint 9C.
 *
 * Uses Node 22+ built-in `node:test` runner with the
 * `--experimental-strip-types` flag (no Vitest/Jest in V1 frontend —
 * keep the toolchain small).
 *
 * Run via:
 *   cd apps/web && npm run test:seo
 *
 * Covers the four properties called out in the Sprint 9C acceptance
 * criteria:
 *   1. `buildAlternates` produces the right URL + hreflang map.
 *   2. JSON-LD output is parseable JSON with the required @graph nodes.
 *   3. `buildOgMetadata` includes `alternateLocale` array.
 *   4. `ogLocaleFor` mapping is correct for known + unknown locales.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { PublicMenuPayload } from "@/types/menu";
import type { LocaleCode } from "@/types/menu";

import {
  ogLocaleFor,
  buildAlternates,
  buildOgMetadata,
  buildJsonLdRestaurant,
  serializeJsonLd,
} from "./seo.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_HOST = "https://menu.example.com";
const SAMPLE_PATH = "/m/modern-cafe";

const SAMPLE_PAYLOAD: PublicMenuPayload = {
  business: {
    id: 1,
    name: "Modern Cafe",
    slug: "modern-cafe",
    logo: "https://cdn.example.com/modern-cafe-logo.webp",
    cover_image: null,
    description: "Kadıköy'ün sevilen kahvecisi.",
    default_locale: "tr",
    currency: "TRY",
  },
  menu: {
    id: 10,
    name: "Kahve Menüsü",
    slug: "kahve",
    description: "Tek origin çekirdekler, üçüncü dalga demleme.",
    default_locale: "tr",
    supported_locales: ["tr", "en"] as LocaleCode[],
    currency: "TRY",
  },
  theme: null,
  categories: [
    {
      id: 100,
      slug: "filtre",
      sort_order: 0,
      name: "Filtre Kahve",
      description: "V60, Chemex ve AeroPress demlemeleri.",
      // Backend returns "model" / "default" / "requested" here, but the
      // legacy TS type (LocaleCode = "tr" | "en") hasn't been widened
      // yet — fixture casts to keep the test focused on SEO helpers.
      locale_used: "model" as unknown as LocaleCode,
      image: null,
      items: [
        {
          id: 1000,
          sort_order: 0,
          name: "V60",
          description: "Tek origin filtre kahve — 250 ml.",
          locale_used: "model" as unknown as LocaleCode,
          price: "12.50",
          compare_at_price: null,
          currency: "TRY",
          image: null,
          is_featured: true,
          is_popular: false,
          is_new: false,
          spice_level: 0,
          allergens: [],
          dietary_tags: ["vegan"],
        },
      ],
    },
  ],
  allergens: [],
  dietary_tags: [],
  cta: { call_phone: "+902165550011", whatsapp: "+902165550011" },
};

// ---------------------------------------------------------------------------
// ogLocaleFor
// ---------------------------------------------------------------------------

test("ogLocaleFor maps known locales to xx_YY", () => {
  assert.equal(ogLocaleFor("tr"), "tr_TR");
  assert.equal(ogLocaleFor("en"), "en_US");
  assert.equal(ogLocaleFor("de"), "de_DE");
  assert.equal(ogLocaleFor("ar"), "ar_SA");
});

test("ogLocaleFor falls back to the input for unknown locales", () => {
  assert.equal(ogLocaleFor("fr"), "fr");
  assert.equal(ogLocaleFor("xx"), "xx");
  assert.equal(ogLocaleFor(""), "");
});

// ---------------------------------------------------------------------------
// buildAlternates
// ---------------------------------------------------------------------------

test("buildAlternates returns canonical URL with ?locale= suffix", () => {
  const { canonical } = buildAlternates({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    locales: ["tr", "en"],
    currentLocale: "tr",
  });
  assert.equal(canonical, "https://menu.example.com/m/modern-cafe?locale=tr");
});

test("buildAlternates strips trailing slash from host", () => {
  const { canonical, languages } = buildAlternates({
    host: "https://menu.example.com/",
    basePath: SAMPLE_PATH,
    locales: ["tr", "en"],
    currentLocale: "en",
  });
  assert.equal(canonical, "https://menu.example.com/m/modern-cafe?locale=en");
  assert.equal(languages["tr"], "https://menu.example.com/m/modern-cafe?locale=tr");
});

test("buildAlternates emits one hreflang entry per locale plus x-default", () => {
  const { languages } = buildAlternates({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    locales: ["tr", "en", "de"],
    currentLocale: "tr",
  });
  assert.deepEqual(Object.keys(languages).sort(), ["de", "en", "tr", "x-default"]);
  assert.equal(languages["tr"], "https://menu.example.com/m/modern-cafe?locale=tr");
  assert.equal(languages["en"], "https://menu.example.com/m/modern-cafe?locale=en");
  assert.equal(languages["de"], "https://menu.example.com/m/modern-cafe?locale=de");
});

test("buildAlternates x-default points at the first supported locale", () => {
  const { languages } = buildAlternates({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    locales: ["tr", "en"],
    currentLocale: "en",
  });
  assert.equal(languages["x-default"], "https://menu.example.com/m/modern-cafe?locale=tr");
});

test("buildAlternates x-default falls back to currentLocale when locales empty", () => {
  const { languages } = buildAlternates({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    locales: [],
    currentLocale: "tr",
  });
  assert.equal(languages["x-default"], "https://menu.example.com/m/modern-cafe?locale=tr");
});

// ---------------------------------------------------------------------------
// buildOgMetadata
// ---------------------------------------------------------------------------

test("buildOgMetadata sets locale to OG format of current locale", () => {
  const og = buildOgMetadata({
    business: SAMPLE_PAYLOAD.business,
    menu: SAMPLE_PAYLOAD.menu,
    ogImage: "/demo-assets/og-image.jpg",
    locales: ["tr", "en"],
    currentLocale: "tr",
  });
  assert.equal(og.locale, "tr_TR");
});

test("buildOgMetadata alternateLocale excludes current locale", () => {
  const og = buildOgMetadata({
    business: SAMPLE_PAYLOAD.business,
    menu: SAMPLE_PAYLOAD.menu,
    ogImage: "/demo-assets/og-image.jpg",
    locales: ["tr", "en", "de"],
    currentLocale: "en",
  });
  assert.deepEqual(og.alternateLocale, ["tr_TR", "de_DE"]);
});

test("buildOgMetadata alternateLocale is empty array when only one locale", () => {
  const og = buildOgMetadata({
    business: SAMPLE_PAYLOAD.business,
    menu: SAMPLE_PAYLOAD.menu,
    ogImage: "/demo-assets/og-image.jpg",
    locales: ["tr"],
    currentLocale: "tr",
  });
  assert.deepEqual(og.alternateLocale, []);
});

test("buildOgMetadata carries image + title + description", () => {
  const og = buildOgMetadata({
    business: SAMPLE_PAYLOAD.business,
    menu: SAMPLE_PAYLOAD.menu,
    ogImage: "/demo-assets/og-image.jpg",
    locales: ["tr", "en"],
    currentLocale: "tr",
  });
  assert.equal(og.title, "Modern Cafe — Dijital Menü");
  assert.match(og.description, /Modern Cafe/);
  assert.equal(og.images[0].url, "/demo-assets/og-image.jpg");
  assert.equal(og.images[0].width, 1200);
  assert.equal(og.images[0].height, 630);
});

test("buildOgMetadata url includes business slug and locale", () => {
  const og = buildOgMetadata({
    business: SAMPLE_PAYLOAD.business,
    menu: SAMPLE_PAYLOAD.menu,
    ogImage: "/demo-assets/og-image.jpg",
    locales: ["tr", "en"],
    currentLocale: "en",
  });
  assert.equal(og.url, "/m/modern-cafe?locale=en");
});

// ---------------------------------------------------------------------------
// buildJsonLdRestaurant
// ---------------------------------------------------------------------------

test("buildJsonLdRestaurant returns a parseable JSON graph", () => {
  const graph = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  const serialized = JSON.stringify(graph);
  // Round-trip — important because the page renders the JSON inside a
  // `<script type="application/ld+json" dangerouslySetInnerHTML>`.
  const parsed = JSON.parse(serialized);
  assert.equal(parsed["@context"], "https://schema.org");
  assert.ok(Array.isArray(parsed["@graph"]));
});

/**
 * Walk the JSON-LD tree and collect every node by its `@type`.
 * The top-level wrapper `{ "@context": ..., "@graph": [...] }` needs
 * to be unwrapped, then MenuSection (under `hasMenuSection`) and
 * MenuItem (under `hasMenuItem`) need to be descended into.
 */
function collectNodes(
  root: unknown,
  acc: Array<Record<string, unknown>> = [],
): Array<Record<string, unknown>> {
  if (Array.isArray(root)) {
    for (const n of root) collectNodes(n, acc);
    return acc;
  }
  if (root && typeof root === "object") {
    const node = root as Record<string, unknown>;
    if (typeof node["@type"] === "string") acc.push(node);
    if (Array.isArray(node["@graph"])) collectNodes(node["@graph"], acc);
    if (Array.isArray(node.hasMenuSection)) collectNodes(node.hasMenuSection, acc);
    if (Array.isArray(node.hasMenuItem)) collectNodes(node.hasMenuItem, acc);
  }
  return acc;
}

test("buildJsonLdRestaurant graph contains Restaurant + Menu + MenuSection + MenuItem", () => {
  const graph = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  const nodes = collectNodes(graph);
  const types = nodes.map((n) => n["@type"] as string);
  assert.ok(types.includes("Restaurant"), `expected Restaurant, got ${types.join(",")}`);
  assert.ok(types.includes("Menu"), `expected Menu, got ${types.join(",")}`);
  assert.ok(types.includes("MenuSection"), `expected MenuSection, got ${types.join(",")}`);
  assert.ok(types.includes("MenuItem"), `expected MenuItem, got ${types.join(",")}`);
});

test("buildJsonLdRestaurant Menu node nests sections via hasMenuSection", () => {
  const { "@graph": graph } = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  const menuNode = graph.find((n) => n["@type"] === "Menu");
  assert.ok(menuNode, "Menu node must exist");
  const sections = (
    menuNode as unknown as { hasMenuSection: unknown[] }
  ).hasMenuSection;
  assert.ok(Array.isArray(sections));
  assert.equal(sections.length, 1);
});

test("buildJsonLdRestaurant MenuItem carries offers with price + priceCurrency", () => {
  const graph = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  const nodes = collectNodes(graph);
  const item = nodes.find((n) => n["@type"] === "MenuItem");
  assert.ok(item, "MenuItem node must exist");
  const offers = (
    item as unknown as { offers: { price: string; priceCurrency: string } }
  ).offers;
  assert.equal(offers.price, "12.50");
  assert.equal(offers.priceCurrency, "TRY");
});

test("buildJsonLdRestaurant MenuItem carries suitableForDiet when dietary_tags present", () => {
  const graph = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  const nodes = collectNodes(graph);
  const item = nodes.find((n) => n["@type"] === "MenuItem");
  assert.ok(item);
  const diet = (
    item as unknown as { suitableForDiet?: string[] }
  ).suitableForDiet;
  assert.deepEqual(diet, ["vegan"]);
});

test("buildJsonLdRestaurant Menu inLanguage matches the rendered locale", () => {
  const { "@graph": graph } = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "en",
  });
  const menuNode = graph.find((n) => n["@type"] === "Menu");
  assert.ok(menuNode);
  assert.equal(
    (menuNode as unknown as { inLanguage: string }).inLanguage,
    "en",
  );
});

test("buildJsonLdRestaurant Restaurant node carries telephone when CTA present", () => {
  const { "@graph": graph } = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  const restaurant = graph.find((n) => n["@type"] === "Restaurant");
  assert.ok(restaurant);
  assert.equal(
    (restaurant as unknown as { telephone: string }).telephone,
    "+902165550011",
  );
});

test("buildJsonLdRestaurant still emits valid graph when categories empty", () => {
  const empty: PublicMenuPayload = {
    ...SAMPLE_PAYLOAD,
    categories: [],
  };
  const { "@graph": graph } = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: empty,
    locale: "tr",
  });
  const menuNode = graph.find((n) => n["@type"] === "Menu");
  assert.ok(menuNode);
  assert.deepEqual(
    (menuNode as unknown as { hasMenuSection: unknown[] }).hasMenuSection,
    [],
  );
});

// ---------------------------------------------------------------------------
// serializeJsonLd — stored-XSS guard (ANALYSIS_1 F-12)
// ---------------------------------------------------------------------------

test("serializeJsonLd keeps tenant-controlled names from closing the script tag", () => {
  const evil = "</script><script>alert(document.cookie)</script>";
  const payload: PublicMenuPayload = {
    ...SAMPLE_PAYLOAD,
    business: { ...SAMPLE_PAYLOAD.business, name: evil },
    categories: SAMPLE_PAYLOAD.categories.map((cat) => ({
      ...cat,
      name: evil,
      items: cat.items.map((item) => ({ ...item, name: evil, description: evil })),
    })),
  };
  const graph = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload,
    locale: "tr",
  });

  // The vulnerable form: plain JSON.stringify leaves the closing tag intact.
  assert.ok(JSON.stringify(graph).includes("</script>"), "fixture must be hostile");

  const safe = serializeJsonLd(graph);
  assert.ok(!safe.includes("<"), "no raw '<' may reach the HTML parser");
  assert.ok(!safe.includes(">"), "no raw '>' may reach the HTML parser");
  assert.ok(!safe.toLowerCase().includes("</script"));
  // Escaping must not change the data a crawler parses.
  assert.deepEqual(JSON.parse(safe), JSON.parse(JSON.stringify(graph)));
});

test("serializeJsonLd also escapes '&' and the JS line separators", () => {
  const value = { a: "Tom & Jerry", b: "x" + String.fromCharCode(0x2028) + "y" + String.fromCharCode(0x2029) };
  const safe = serializeJsonLd(value);
  assert.ok(!safe.includes("&"));
  assert.ok(!safe.includes(String.fromCharCode(0x2028)));
  assert.ok(!safe.includes(String.fromCharCode(0x2029)));
  assert.deepEqual(JSON.parse(safe), value);
});

test("serializeJsonLd leaves ordinary output byte-for-byte unchanged", () => {
  const graph = buildJsonLdRestaurant({
    host: SAMPLE_HOST,
    basePath: SAMPLE_PATH,
    payload: SAMPLE_PAYLOAD,
    locale: "tr",
  });
  // Sample data has no <, >, & or separators, so nothing may be rewritten.
  assert.equal(serializeJsonLd(graph), JSON.stringify(graph));
});

test("buildJsonLdRestaurant makes uploaded image URLs absolute (Schema.org wants absolute URLs)", () => {
  // Uploads are stored as `/media/…`; an older row can still carry the loopback
  // origin it was uploaded from. Neither is usable by a crawler as is.
  const payload = structuredClone(SAMPLE_PAYLOAD);
  payload.business.logo = "/media/tenants/modern-cafe/image/logo.jpg";
  payload.categories[0].items[0].image = "http://localhost:3000/media/uploads/1/v60.jpg";

  const nodes = collectNodes(
    buildJsonLdRestaurant({
      host: SAMPLE_HOST,
      basePath: SAMPLE_PATH,
      payload,
      locale: "tr",
    }),
  );
  const restaurant = nodes.find((n) => n["@type"] === "Restaurant");
  const item = nodes.find((n) => n["@type"] === "MenuItem");
  assert.equal(restaurant?.image, "https://menu.example.com/media/tenants/modern-cafe/image/logo.jpg");
  assert.equal(item?.image, "https://menu.example.com/media/uploads/1/v60.jpg");
});

test("buildJsonLdRestaurant leaves an already-absolute CDN image alone and omits missing ones", () => {
  const nodes = collectNodes(
    buildJsonLdRestaurant({
      host: SAMPLE_HOST,
      basePath: SAMPLE_PATH,
      payload: SAMPLE_PAYLOAD,
      locale: "tr",
    }),
  );
  assert.equal(
    nodes.find((n) => n["@type"] === "Restaurant")?.image,
    "https://cdn.example.com/modern-cafe-logo.webp",
  );
  assert.equal("image" in (nodes.find((n) => n["@type"] === "MenuItem") ?? {}), false);
});
