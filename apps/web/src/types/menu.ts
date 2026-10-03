/**
 * TypeScript mirror of `apps/menu/services/get_full_menu_payload` in the
 * Django backend (Sprint 3A). The backend is the source of truth — if a
 * field shape changes there, mirror it here on the same commit so the
 * contract stays unambiguous.
 *
 * Notable:
 *  - Translated fields inside categories / items arrive already-resolved
 *    as plain strings (the backend's `translation.resolve_*` helpers apply
 *    locale fallback server-side). The companion `locale_used` field tells
 *    us which locale actually served the text.
 *  - Top-level `allergens[].name` and `dietary_tags[].name` are still
 *    sent as `{ en, tr }` objects — pickTranslation() picks the right one.
 *  - Items are nested inside their parent category; there is no flat
 *    `items` array at the top level.
 */

export type LocaleCode = "tr" | "en";

/**
 * Where a piece of translated text came from. NOT a locale code:
 *   requested — the translation for the locale the client asked for
 *   default   — that translation is missing, the venue's default-language text is shown
 *   model     — taken straight from the model field (no translation table involved)
 * (Kept as a union with LocaleCode for older fixtures that still pass a locale.)
 */
export type ContentSource = LocaleCode | "requested" | "default" | "model";

export interface Translation {
  en?: string;
  tr?: string;
}

export interface PublicMenuBusiness {
  id: number;
  name: string;
  slug: string;
  /** Absolute URL or null. Sprint A: resolved server-side via
   *  OrganizationSummarySerializer so admin uploads surface directly. */
  logo: string | null;
  /** Absolute URL or null. Sprint A: same resolver as logo. */
  cover_image?: string | null;
  /** Short marketing blurb shown under the business name (hero / footer). */
  description?: string;
  /** Physical address line (free text). Sprint A (Faz 2.1). */
  address?: string;
  /** Google Maps deep link. Sprint A (Faz 2.1). */
  google_maps_url?: string;
  /** External website (e.g. https://moderncafe.com). Sprint A (Faz 2.1). */
  website?: string;
  /** Public contact email. Sprint A (Faz 2.1). */
  email?: string;
  /** Public contact phone (international format). Sprint A (Faz 2.1). */
  phone?: string;
  default_locale: LocaleCode;
  currency: string;
}

export interface PublicMenuMenu {
  id: number;
  name: string;
  slug: string;
  description?: string;
  default_locale: LocaleCode;
  supported_locales: LocaleCode[];
  currency: string;
}

export interface PublicMenuTheme {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  font_family?: string | null;
  layout_variant?: string | null;
}

export interface PublicMenuItem {
  id: number;
  sort_order: number;
  name: string;
  description: string;
  locale_used: ContentSource;
  price: string; // decimal serialized as string (DRF default)
  compare_at_price: string | null;
  currency: string;
  image: string | null;
  is_featured: boolean;
  is_popular: boolean;
  is_new: boolean;
  spice_level: number; // 0 = none
  allergens: string[]; // allergen codes (e.g. "gluten")
  dietary_tags: string[]; // dietary tag codes (e.g. "vegan")
  // Sprint D1a — mevzuat uyum alanları (D-031). All optional; null /
  // missing values render nothing in the public drawer and print page.
  calories?: number | null;
  portion_size?: string;
  ingredients?: string;
  legal_notes?: string;
  contains_alcohol?: boolean;
  is_halal?: boolean | null;
}

export interface PublicMenuCategory {
  id: number;
  slug: string;
  sort_order: number;
  name: string;
  description: string;
  locale_used: ContentSource;
  image: string | null;
  items: PublicMenuItem[];
}

export interface PublicMenuAllergen {
  code: string;
  name: Translation;
  icon: string;
}

export interface PublicMenuDietaryTag {
  code: string;
  name: Translation;
  icon: string;
  color: string;
}

export interface PublicMenuCta {
  call_phone?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
}

export interface PublicMenuPayload {
  business: PublicMenuBusiness;
  menu: PublicMenuMenu | null;
  theme: PublicMenuTheme | null;
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietary_tags: PublicMenuDietaryTag[];
  cta: PublicMenuCta;
}

export interface PublicMenuApiEnvelope {
  data: PublicMenuPayload;
  meta?: { request_id?: string };
}

export interface PublicMenuApiError {
  error: { code: string; message: string };
  meta?: { request_id?: string };
}

/**
 * Resolve a Translation object to a single string. Used for the top-level
 * `allergens[].name` and `dietary_tags[].name` (categories / items are
 * already resolved by the backend).
 */
export function pickTranslation(
  t: Translation | string | null | undefined,
  locale: LocaleCode,
): string {
  if (!t) return "";
  if (typeof t === "string") return t;
  const primary = t[locale];
  if (primary) return primary;
  const fallback = locale === "tr" ? t.en : t.tr;
  return fallback ?? Object.values(t).find((v) => !!v) ?? "";
}
