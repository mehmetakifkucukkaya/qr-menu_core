/**
 * Public-page SEO helpers — Sprint 9C.
 *
 * Three concerns are kept in one module because they all share the same
 * inputs (`business` + `menu` + supported locales) and produce Next.js
 * `Metadata` shapes:
 *
 *  1. **hreflang / canonical alternates** — `buildAlternates()` returns
 *     `{ canonical, languages }` for `Metadata.alternates`. The `languages`
 *     map becomes `<link rel="alternate" hreflang="…" href="…" />` tags
 *     rendered by Next.js, plus an `x-default` entry.
 *  2. **Open Graph locale tags** — `buildOgMetadata()` returns the
 *     `Metadata["openGraph"]` object with `locale` (e.g. `tr_TR`) and
 *     `alternateLocale` (other supported OG locales).
 *  3. **Schema.org JSON-LD graph** — `buildJsonLdRestaurant()` returns a
 *     `{ "@context": "https://schema.org", "@graph": [...] }` graph with
 *     Restaurant + Menu + MenuSection + MenuItem nodes (Google's
 *     structured-data validator requires this nesting).
 *
 * All helpers are pure: same input → same output, no I/O. Safe to call
 * from RSC `generateMetadata` and from `<script>` rendering.
 *
 * Locale format notes:
 *  - `hreflang` uses bare BCP-47 codes (`tr`, `en`) per Google's guidance.
 *  - OG uses the legacy `xx_YY` underscore format (`tr_TR`, `en_US`).
 *  - `LOCALE_OG_MAP` is the bridge; new locales are added in one place.
 */

import type { PublicMenuPayload } from "@/types/menu";
import { absoluteMediaUrl } from "./media-url.ts";

// ---------------------------------------------------------------------------
// Locale format mapping
// ---------------------------------------------------------------------------

/**
 * Map from BCP-47 locale code (URL param) to Open Graph `xx_YY` format.
 * hreflang keeps the bare code (`tr`), OG uses the underscore form (`tr_TR`).
 * Add a new entry whenever a new locale joins `LOCALE_CHOICES` on the
 * backend (see `apps/menu/models.py`).
 */
const LOCALE_OG_MAP: Record<string, string> = {
  tr: "tr_TR",
  en: "en_US",
  de: "de_DE",
  ar: "ar_SA",
};

/**
 * Convert a bare locale code to its Open Graph format.
 * Falls back to the input if no mapping exists (e.g. `fr` → `fr`).
 */
export function ogLocaleFor(locale: string): string {
  return LOCALE_OG_MAP[locale] ?? locale;
}

// ---------------------------------------------------------------------------
// Alternates (canonical + hreflang languages map)
// ---------------------------------------------------------------------------

export interface BuildAlternatesOptions {
  /** Absolute origin without trailing slash, e.g. `https://menu.example.com`. */
  host: string;
  /** Path within the app, e.g. `/m/modern-cafe`. Leading slash required. */
  basePath: string;
  /** Locale codes the menu declares as supported. */
  locales: string[];
  /** The locale currently being rendered. */
  currentLocale: string;
}

export interface BuildAlternatesResult {
  /** Absolute URL with `?locale=` query — the canonical for this locale. */
  canonical: string;
  /** Map keyed by hreflang code (`tr`, `en`, `x-default`) → absolute URL. */
  languages: Record<string, string>;
}

/**
 * Build canonical URL + hreflang language map for Next.js Metadata.
 *
 * Each locale gets its own canonical (`?locale=tr`, `?locale=en`) so
 * search engines don't consolidate the per-locale variants into one.
 * The `x-default` entry points at the first locale (typically the menu's
 * default locale) — Google treats that as the fallback for unmatched
 * locales / markets.
 */
export function buildAlternates(opts: BuildAlternatesOptions): BuildAlternatesResult {
  const { host, basePath, locales, currentLocale } = opts;
  const origin = host.replace(/\/$/, "");
  const baseUrl = `${origin}${basePath.startsWith("/") ? basePath : `/${basePath}`}`;
  const canonical = `${baseUrl}?locale=${currentLocale}`;
  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = `${baseUrl}?locale=${loc}`;
  }
  // x-default → first supported locale (falls back to current when the
  // list is empty, which shouldn't happen in practice but keeps the
  // helper total).
  const defaultLocale = locales[0] ?? currentLocale;
  languages["x-default"] = `${baseUrl}?locale=${defaultLocale}`;
  return { canonical, languages };
}

// ---------------------------------------------------------------------------
// Open Graph metadata
// ---------------------------------------------------------------------------

export interface BuildOgMetadataInput {
  business: PublicMenuPayload["business"];
  menu: PublicMenuPayload["menu"];
  ogImage: string;
  locales: string[];
  currentLocale: string;
}

/**
 * Build the `Metadata["openGraph"]` object for the public menu page.
 *
 * - `locale` is the OG-format code for the currently rendered locale
 *   (e.g. `tr_TR` when rendering `/m/modern-cafe?locale=tr`).
 * - `alternateLocale` is the array of *other* supported locales, so
 *   social cards / link unfurls know about every available variant.
 */
export function buildOgMetadata(input: BuildOgMetadataInput): {
  title: string;
  description: string;
  type: "website";
  locale: string;
  alternateLocale: string[];
  images: Array<{ url: string; width: number; height: number; alt: string }>;
  url: string;
} {
  const { business, menu, ogImage, locales, currentLocale } = input;
  const description = `${business.name} — dijital menü${
    menu?.description ? `: ${menu.description}` : ""
  }`.slice(0, 200);
  const title = `${business.name} — Dijital Menü`;
  return {
    title,
    description,
    type: "website",
    locale: ogLocaleFor(currentLocale),
    alternateLocale: locales
      .filter((l) => l !== currentLocale)
      .map(ogLocaleFor),
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: `${business.name} dijital menü`,
      },
    ],
    // `url` was omitted previously — Sprint 9C adds it so crawlers can
    // pin a single canonical for each locale variant.
    url: `/m/${business.slug}?locale=${currentLocale}`,
  };
}

// ---------------------------------------------------------------------------
// Schema.org JSON-LD
// ---------------------------------------------------------------------------

export interface BuildJsonLdInput {
  /** Absolute origin without trailing slash. */
  host: string;
  /** Path within the app, e.g. `/m/modern-cafe`. */
  basePath: string;
  payload: PublicMenuPayload;
  /** Locale currently being rendered (used for `inLanguage`). */
  locale: string;
}

interface JsonLdNode {
  "@type": string;
  "@id"?: string;
  name: string;
  [key: string]: unknown;
}

export interface JsonLdGraph {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
}

// ---------------------------------------------------------------------------
// Safe inlining of JSON-LD into a <script> tag
// ---------------------------------------------------------------------------

// Characters that are significant to the HTML parser (`<` and `>` can end the
// script element, `&` starts entities in some embedding contexts) plus U+2028 /
// U+2029, which are legal in JSON but were line terminators in JavaScript
// before ES2019. Built from char codes so the source stays free of invisible
// characters.
const JSON_LD_UNSAFE = new RegExp(
  `[<>&${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`,
  "g",
);

/**
 * Serialise a JSON-LD graph for `<script type="application/ld+json">`.
 *
 * `JSON.stringify` does NOT escape `<`, so a business, category or item name
 * such as `</script><script>…</script>` would close the tag and run as markup
 * on the public menu page (stored XSS, ANALYSIS_1 F-12). Names are tenant
 * input, and AI/PDF import and the demo-menu template copy them in as well.
 * Every unsafe character is emitted as a JSON unicode escape, which parses
 * back to exactly the same value, so crawlers see identical data.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(
    JSON_LD_UNSAFE,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

/**
 * Build the Schema.org JSON-LD graph for the public menu page.
 *
 * The graph contains four node types:
 *   - `Restaurant` (business info: name, URL, image, telephone, servesCuisine)
 *   - `Menu` (the menu itself, with `inLanguage` + `hasMenuSection`)
 *   - `MenuSection` × N (one per category)
 *   - `MenuItem` × M (one per item, nested under each section)
 *
 * Schema.org validators (Google, Yandex) require the `hasMenuSection`
 * nesting; flattening the items at the top level will produce warnings.
 *
 * Decimal prices are kept as strings (`"12.50"`) — `MenuItem.offers.price`
 * accepts either a Number or a String per Schema.org's Offer spec, and
 * keeping the string avoids float rounding in JSON serialization.
 */
export function buildJsonLdRestaurant(input: BuildJsonLdInput): JsonLdGraph {
  const { host, basePath, payload, locale } = input;
  const { business, menu, categories, cta } = payload;
  const origin = host.replace(/\/$/, "");
  const baseUrl = `${origin}${basePath.startsWith("/") ? basePath : `/${basePath}`}`;
  const menuUrl = `${baseUrl}?locale=${locale}`;

  // ---- Restaurant node --------------------------------------------------
  const restaurant: JsonLdNode = {
    "@type": "Restaurant",
    "@id": `${baseUrl}#restaurant`,
    name: business.name,
    url: menuUrl,
    servesCuisine: menu?.name ?? business.name,
  };
  // Schema.org wants an absolute image URL; uploads are stored as `/media/…`.
  const logoUrl = absoluteMediaUrl(origin, business.logo);
  if (logoUrl) {
    restaurant.image = logoUrl;
  }
  if (cta && typeof cta === "object") {
    const phone = (cta as { call_phone?: string | null }).call_phone;
    if (phone) {
      restaurant.telephone = phone;
    }
  }

  // ---- Menu / MenuSection / MenuItem nodes ------------------------------
  const sections: JsonLdNode[] = (categories || []).map((cat, idx) => {
    const sectionId = `${baseUrl}#section-${cat.id ?? idx}`;
    const menuItems: JsonLdNode[] = (cat.items || []).map((item) => {
      const menuItem: JsonLdNode = {
        "@type": "MenuItem",
        name: item.name,
        offers: {
          "@type": "Offer",
          price: item.price,
          priceCurrency: item.currency,
        },
      };
      if (item.description) {
        menuItem.description = item.description;
      }
      if (Array.isArray(item.dietary_tags) && item.dietary_tags.length > 0) {
        menuItem.suitableForDiet = item.dietary_tags;
      }
      const imageUrl = absoluteMediaUrl(origin, item.image);
      if (imageUrl) {
        menuItem.image = imageUrl;
      }
      return menuItem;
    });
    const section: JsonLdNode = {
      "@type": "MenuSection",
      "@id": sectionId,
      name: cat.name,
      hasMenuItem: menuItems,
    };
    if (cat.description) {
      section.description = cat.description;
    }
    return section;
  });

  const menuNode: JsonLdNode = {
    "@type": "Menu",
    "@id": `${baseUrl}#menu`,
    name: menu?.name ?? business.name,
    inLanguage: locale,
    hasMenuSection: sections,
  };
  if (menu?.description) {
    menuNode.description = menu.description;
  }

  return {
    "@context": "https://schema.org",
    "@graph": [restaurant, menuNode],
  };
}
