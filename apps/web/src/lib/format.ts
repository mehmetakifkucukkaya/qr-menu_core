/**
 * Lightweight formatting helpers. Pure, no side effects — safe in both
 * server components and the browser.
 */

/**
 * Format a decimal-as-string price (e.g. "12.50") for display.
 *
 *   formatPrice("12.50", "TRY")   → "12,50 ₺"
 *   formatPrice("12.50", "USD")   → "$12.50"
 *   formatPrice("0",     "TRY")   → "₺0,00"
 *
 * Uses Intl.NumberFormat for non-TRY currencies (falls back gracefully on
 * V1's minimal Node 20 image). For TRY we use a Turkish locale formatter
 * to get the comma decimal separator + ₺ suffix that Modern Cafe expects.
 */
export function formatPrice(price: string | number, currency: string): string {
  const num = typeof price === "string" ? Number.parseFloat(price) : price;
  if (!Number.isFinite(num)) return price.toString();
  const cur = (currency || "TRY").toUpperCase();
  try {
    if (cur === "TRY") {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 2,
      }).format(num);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
    }).format(num);
  } catch {
    // Intl occasionally throws on exotic currency codes; degrade gracefully.
    return `${num.toFixed(2)} ${cur}`;
  }
}

/** Title-case a slug for fallback display. */
export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
