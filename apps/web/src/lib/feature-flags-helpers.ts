/**
 * Pure helpers for the feature-flag system — Sprint B3b.
 *
 * Kept in a plain `.ts` file (no React, no JSX) so the
 * `--experimental-strip-types` Node 22+ test runner can import the
 * helper without needing a JSX-aware loader. `lib/feature-flags.tsx`
 * re-exports `hasFeature` from this module so the public import path
 * (`@/lib/feature-flags`) keeps a single name for callers that use
 * both the pure helper and the React provider / hooks.
 *
 * The rules encoded here are intentionally narrow:
 *
 *   - `null` / `undefined` settings → every flag is `false` (the
 *     conservative default; the public UI degrades to the safest
 *     variant when the tenant fetch hasn't resolved yet).
 *   - A flag that is missing from the `features` dict, or whose value
 *     is anything other than the literal `true`, is treated as `false`.
 *     This guards against a stale client build that doesn't know
 *     about a new server-side flag from silently granting it.
 */

import type {
  FeatureName,
  PublicSettings,
} from "@/types/public";

/**
 * Pure, null-safe feature-flag check. Returns `false` when settings
 * haven't loaded yet (e.g. the server component hadn't propagated them
 * to the client subtree, or the fetch failed). Callers should treat
 * "absent" the same as "feature disabled" — render the safest variant.
 */
export function hasFeature(
  settings: PublicSettings | null | undefined,
  feature: FeatureName,
): boolean {
  if (!settings || !settings.features) return false;
  const flag = settings.features[feature];
  // Treat undefined / non-boolean as false (defensive — backend always
  // returns the full 8-key dict but new flags added server-side could
  // arrive as `undefined` on a stale build).
  return flag === true;
}