/**
 * TypeScript mirror of the admin REST API (Sprint 2 backend).
 *
 * The backend is the source of truth — if a field shape changes there,
 * mirror it here on the same commit so the contract stays unambiguous.
 *
 * Conventions:
 *  - All API envelopes use `{ data, meta? }` for success or
 *    `{ error: { code, message }, meta? }` for failure, mirroring the
 *    public menu envelope (see `types/menu.ts`).
 *  - Decimal / numeric values that come from Django DecimalField arrive
 *    as strings (DRF default) to avoid JS float rounding. Parse with
 *    `Number.parseFloat` before arithmetic.
 *  - Locale codes are `"tr" | "en"` to keep parity with the public UI.
 */

/** Locale codes supported by the admin (mirrors PublicMenuLocaleCode). */
export type AdminLocaleCode = "tr" | "en";

/** Global user role (mirrors apps.accounts.models.UserRole). */
export type AdminUserRole =
  | "admin"
  | "agency_admin"
  | "owner"
  | "manager"
  | "staff";

/** Per-organization membership role. */
export type MembershipRole =
  | "owner"
  | "manager"
  | "staff"
  | "agency_admin";

// ---------------------------------------------------------------------------
// Auth envelope
// ---------------------------------------------------------------------------

/** Payload returned by `GET /api/v1/auth/csrf`. */
export interface CsrfResponse {
  csrfToken: string;
}

/** Payload returned by `GET /api/v1/me` and `POST /api/v1/auth/login`. */
export interface CurrentUser {
  id: number;
  email: string;
  full_name: string;
  role: AdminUserRole;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  date_joined: string; // ISO datetime
  created_at: string; // ISO datetime
}

/** Generic `{ data, meta }` envelope. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: { request_id?: string };
}

/** Generic `{ error, meta }` envelope. */
export interface ApiErrorEnvelope {
  error: { code: string; message: string };
  meta?: { request_id?: string };
}

// ---------------------------------------------------------------------------
// Organization / Branch
// ---------------------------------------------------------------------------

export interface Organization {
  id: number;
  name: string;
  slug: string;
  legal_name: string;
  description: string;
  logo: string | null;
  cover_image: string | null;
  phone: string;
  whatsapp_phone: string;
  email: string;
  website: string;
  instagram_url: string;
  address: string;
  google_maps_url: string;
  default_locale: AdminLocaleCode;
  supported_locales: AdminLocaleCode[];
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSummary {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  default_locale: AdminLocaleCode;
  currency: string;
}

export interface Branch {
  id: number;
  organization: OrganizationSummary;
  organization_id?: number;
  name: string;
  slug: string;
  phone: string;
  whatsapp_phone: string;
  address: string;
  google_maps_url: string;
  working_hours_json: unknown; // raw JSON from backend, schema TBD
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export interface ThemeConfig {
  id: number;
  organization: OrganizationSummary;
  organization_id?: number;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string | null;
  text_color: string | null;
  font_family: string | null;
  layout_variant: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Menu / Category / Item — admin read-side
// ---------------------------------------------------------------------------

export interface MenuTranslation {
  id?: number;
  locale: AdminLocaleCode;
  name: string;
  description?: string;
}

export interface AdminMenu {
  id: number;
  organization: { id: number; name: string; slug: string } | null;
  organization_id?: number;
  branch: { id: number; name: string; slug: string } | null;
  branch_id?: number | null;
  name: string;
  slug: string;
  description: string;
  default_locale: AdminLocaleCode;
  supported_locales: AdminLocaleCode[];
  is_active: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminMenuCategory {
  id: number;
  menu_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string;
  image: string | null;
  sort_order: number;
  is_active: boolean;
  translations: MenuTranslation[];
  created_at: string;
  updated_at: string;
}

export interface AdminMenuItem {
  id: number;
  menu_id: number;
  category_id: number;
  name: string;
  description: string;
  image: string | null;
  price: string; // decimal-as-string (DRF default)
  compare_at_price: string | null;
  currency: string;
  is_active: boolean;
  is_available: boolean;
  is_featured: boolean;
  is_popular: boolean;
  is_new: boolean;
  spice_level: number;
  sort_order: number;
  allergen_ids: number[];
  dietary_tag_ids: number[];
  translations: MenuTranslation[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Reference data (Allergens / Dietary tags)
// ---------------------------------------------------------------------------

export interface Allergen {
  id: number;
  code: string;
  name: { tr?: string; en?: string };
  icon: string;
  description: string;
  is_active: boolean;
}

export interface DietaryTag {
  id: number;
  code: string;
  name: { tr?: string; en?: string };
  icon: string;
  color: string;
  is_active: boolean;
}
