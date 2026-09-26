/**
 * SVG placeholder generator — the final fallback layer for images.
 *
 * Implements docs/FRONTEND_PLACEHOLDERS.md ("Katman 4: SVG Placeholder").
 * The 4-layer chain (DB image → /demo-assets/*.webp → Unsplash → SVG)
 * is collapsed into this single helper for V1; Sprint 6 may layer in
 * the upstream caches.
 */

export interface PlaceholderOptions {
  emoji: string;
  color1: string;
  color2?: string;
  size?: number;
  /** Used as aria-label / role="img" text. */
  label?: string;
}

/** Curated defaults for the Modern Cafe category set. */
const CATEGORY_DEFAULTS: Record<string, { emoji: string; color1: string; color2: string }> = {
  kahveler: { emoji: "☕", color1: "#8B5A3C", color2: "#D4A574" },
  "soguk-icecekler": { emoji: "🧊", color1: "#5B8DB8", color2: "#A3C9E2" },
  tatlilar: { emoji: "🍰", color1: "#A0522D", color2: "#E8C8A8" },
  kahvalti: { emoji: "🍳", color1: "#E8A04F", color2: "#F4D29C" },
  sandvicler: { emoji: "🥪", color1: "#7C9473", color2: "#C4D4B8" },
  icecekler: { emoji: "🥤", color1: "#5B8DB8", color2: "#A3C9E2" },
};

const DEFAULT_FALLBACK = { emoji: "🍽️", color1: "#8B5A3C", color2: "#D4A574" };

function lookupCategory(slug?: string | null) {
  if (!slug) return DEFAULT_FALLBACK;
  return CATEGORY_DEFAULTS[slug] ?? DEFAULT_FALLBACK;
}

export function getCategoryPlaceholder(categorySlug: string, size = 400): string {
  const def = lookupCategory(categorySlug);
  return generatePlaceholderSvg({
    emoji: def.emoji,
    color1: def.color1,
    color2: def.color2,
    size,
    label: categorySlug,
  });
}

export function getItemPlaceholder(
  item: { image?: string | null; category_slug?: string | null; name?: string },
  size = 600,
): string {
  // Layer 1: real DB image, if any.
  if (item.image) return item.image;
  // Layer 4: SVG placeholder using the parent category's palette.
  const def = lookupCategory(item.category_slug);
  return generatePlaceholderSvg({
    emoji: def.emoji,
    color1: def.color1,
    color2: def.color2,
    size,
    label: item.name,
  });
}

/**
 * Business-level cover image fallback. Uses a generic warm gradient
 * keyed off the business slug, so different businesses get visually
 * distinct (but still on-brand) placeholders.
 */
export function getBusinessCoverPlaceholder(
  businessSlug: string,
  size = 1200,
): string {
  const hash = simpleHash(businessSlug);
  const palette = [
    { c1: "#8B5A3C", c2: "#D4A574" },
    { c1: "#5B8DB8", c2: "#A3C9E2" },
    { c1: "#7C9473", c2: "#C4D4B8" },
    { c1: "#E8A04F", c2: "#F4D29C" },
  ];
  const { c1, c2 } = palette[hash % palette.length];
  return generatePlaceholderSvg({
    emoji: "🍽️",
    color1: c1,
    color2: c2,
    size,
    label: businessSlug,
  });
}

export function generatePlaceholderSvg(opts: PlaceholderOptions): string {
  const { emoji, color1, color2 = color1, size = 400, label = "" } = opts;
  const ariaLabel = escapeXml(label || emoji);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${ariaLabel}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${color1}"/><stop offset="100%" stop-color="${color2}"/></linearGradient></defs><rect width="${size}" height="${size}" fill="url(#g)"/><text x="50%" y="50%" font-size="${Math.round(size * 0.45)}" text-anchor="middle" dominant-baseline="central">${emoji}</text></svg>`;
  // Buffer is available in both Node and the browser; works in RSC.
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(svg, "utf-8").toString("base64")
      : btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${b64}`;
}

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[c] ?? c,
  );
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
