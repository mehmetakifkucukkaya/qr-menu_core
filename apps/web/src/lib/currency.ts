/**
 * Currency resolution chain — Sprint A (Faz 1.2).
 *
 * The public menu payload currently surfaces three currency sources:
 *
 *   1. ``menu.currency``         (preferred, customer-overridable later)
 *   2. ``business.currency``    (tenant default)
 *   3. any item's currency      (first non-empty wins; fallback)
 *
 * If all three are missing we fall back to the TR market default ("TRY").
 * This is what the cart drawer, the order checkout, and the order
 * confirmation all need to read in lockstep — otherwise a EUR menu with
 * EUR items would render "EUR" in the hero but "TRY" in the cart total.
 *
 * The function is deliberately defensive about empty strings (an admin
 * could clear a field in the future) and ``null`` / ``undefined`` payloads.
 */

export interface CurrencySource {
  currency?: string | null;
}

const DEFAULT_CURRENCY = "TRY";

/**
 * Return the first non-empty currency code from the priority chain:
 *   menu → business → first item → DEFAULT_CURRENCY ("TRY").
 *
 * Pure function — no DOM, no React. Safe to import from server components,
 * client components, and unit tests alike.
 */
export function resolveCurrency(
  menu: CurrencySource | null | undefined,
  business: CurrencySource | null | undefined,
  items: readonly CurrencySource[] | null | undefined,
): string {
  const menuCode = readCurrency(menu);
  if (menuCode) return menuCode;

  const businessCode = readCurrency(business);
  if (businessCode) return businessCode;

  for (const item of items ?? []) {
    const code = readCurrency(item);
    if (code) return code;
  }

  return DEFAULT_CURRENCY;
}

/** Strip whitespace + uppercase; treat empty as missing. */
function readCurrency(source: CurrencySource | null | undefined): string | null {
  if (!source) return null;
  const raw = source.currency;
  if (!raw || typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return code.length > 0 && code.length <= 8 ? code : null;
}

export { DEFAULT_CURRENCY };