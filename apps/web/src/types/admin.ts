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
// QR codes (Sprint 5B frontend — backend shipped in 5A)
// ---------------------------------------------------------------------------

/** Tiny nested summary used by QR serializer for menu/branch/org. */
export interface QRRelatedSummary {
  id: number;
  name: string;
  slug: string;
}

/**
 * Mirror of `apps.qr.serializers.QRCodeSerializer`.
 *
 * Read fields: `organization`, `branch`, `menu` (all nested summaries;
 * `branch` may be `null` when the QR targets the org-wide menu).
 * Write fields (only on POST): `organization_id`, `branch_id`, `menu_id`.
 *
 * `target_url` is server-computed on save — clients display it but never
 * send it. `scan_count` is incremented by the analytics pipeline (D-017),
 * not editable. Soft delete: `DELETE` flips `is_active` to `false`.
 */
export interface AdminQRCode {
  id: number;
  organization: QRRelatedSummary;
  branch: QRRelatedSummary | null;
  menu: QRRelatedSummary;
  label: string;
  target_url: string;
  table_number: string;
  scan_count: number;
  is_active: boolean;
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

// ---------------------------------------------------------------------------
// Admin summary (Sprint 4C)
// ---------------------------------------------------------------------------

/** Single audit event row as returned by `/api/v1/admin/summary`. */
export interface AuditEvent {
  id: number;
  /** Email of the actor, or the literal string "system". */
  actor: string;
  action: AuditAction;
  target_type: AuditTargetType;
  target_id: number;
  /** Human-readable snapshot (e.g. "Türk Kahvesi (modern-cafe)"). */
  target_repr: string;
  /** Change details — shape varies by action (e.g. price_changed
   *  has `{old, new}`; updated has `{fields: string[]}`. */
  payload: Record<string, unknown>;
  /** ISO 8601 datetime. */
  created_at: string;
}

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "price_changed"
  | "published"
  | "unpublished"
  | "deactivated"
  | "reactivated"
  | "reordered";

export type AuditTargetType =
  | "menu"
  | "category"
  | "item"
  | "branch"
  | "theme"
  | "organization";

/** Slim org summary embedded in the dashboard payload. */
export interface SummaryOrganization {
  id: number;
  name: string;
  slug: string;
  currency: string;
}

/** Full response of `GET /api/v1/admin/summary`. */
export interface AdminSummary {
  menu_count: number;
  category_count: number;
  item_count: number;
  /** Items that are both is_active AND is_available — the "live" count. */
  active_item_count: number;
  branch_count: number;
  /** Up to 10 most recent events, newest first. */
  recent_events: AuditEvent[];
  organization: SummaryOrganization | null;
}

// ---------------------------------------------------------------------------
// PDF menu import (Sprint 7B — backend shipped in 7A / D-021)
// ---------------------------------------------------------------------------

/**
 * Status machine of a `MenuImportDraft`. The list endpoint only returns
 * the lifecycle states (`pending`, `parsing`, `parsed`, `confirmed`,
 * `discarded`, `failed`); `failed` carries an inline `error` payload.
 */
export type MenuImportStatus =
  | "pending"
  | "parsing"
  | "parsed"
  | "confirmed"
  | "discarded"
  | "failed";

/** Single parsed item inside a draft. All editable fields use this shape. */
export interface MenuImportItem {
  id: number;
  sort_order: number;
  category_name: string;
  name: string;
  description: string;
  /** Decimal serialized as string (DRF default). */
  price: string | null;
  currency: string;
  allergens: string[];
  dietary_tags: string[];
  raw_text: string;
  /** Confidence score 0.00 – 1.00. Frontend highlights < 0.5 in red. */
  confidence: number;
  /** Set to true by the backend on the first successful PATCH. */
  is_edited: boolean;
}

/**
 * Summary row returned by `GET /api/v1/admin/pdf-import/drafts/`.
 *
 * Items are NOT included here — the detail endpoint exposes them. The
 * list response also carries a server-computed `item_count` annotation
 * (via `Count("items")`) so the list page can show "23 öğe" without a
 * follow-up detail fetch per row.
 */
export interface MenuImportDraftSummary {
  id: number;
  status: MenuImportStatus;
  ai_provider: string | null;
  ai_model: string | null;
  raw_pdf_filename: string;
  confidence_avg: number | null;
  item_count: number;
  menu_id: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Full detail returned by `GET /api/v1/admin/pdf-import/drafts/{id}/`.
 * Includes items + bytes + error payload (for failed drafts).
 */
export interface MenuImportDraftDetail extends MenuImportDraftSummary {
  raw_pdf_size_bytes: number;
  error: { code: string; message: string } | null;
  items: MenuImportItem[];
}

/** Response shape of `POST /api/v1/admin/pdf-import/upload/`. */
export interface PdfUploadResponse {
  draft_id: number;
  status: MenuImportStatus;
  ai_provider: string | null;
  ai_model: string | null;
  item_count: number;
  confidence_avg: number | null;
}

/** Response shape of `POST /api/v1/admin/pdf-import/drafts/{id}/confirm/`. */
export interface PdfConfirmResponse {
  menu_id: number;
  category_count: number;
  item_count: number;
}

/**
 * Whitelisted editable fields on `PATCH /api/v1/admin/pdf-import/items/{id}/`.
 * Mirrors `EDITABLE_FIELDS` in `backend/apps/pdf_import/schemas.py`.
 */
export interface MenuImportItemPatch {
  name?: string;
  description?: string;
  /** Decimal serialized as string (e.g. "45.00"). Backend coerces. */
  price?: string | null;
  allergens?: string[];
  dietary_tags?: string[];
  category_name?: string;
}

// ---------------------------------------------------------------------------
// AI Translate + Describe (Sprint 9B frontend — backend shipped in 9A)
// ---------------------------------------------------------------------------

/**
 * Response payload of `POST /api/v1/admin/translate/`.
 * Returns a single translated string with cache + provider metadata so the
 * admin UI can show "Cached ✓" / "OpenAI (gpt-4o)" hints inline.
 */
export interface AITranslateTextResponse {
  translated: string;
  provider: string;
  model: string;
  confidence: string | null;
  cached: boolean;
  source_locale: AdminLocaleCode;
  target_locale: AdminLocaleCode;
}

/**
 * Single row in the `translations` array of the multi-locale menu
 * item / category translate endpoint response.
 */
export interface AITranslateEntityRow {
  locale: AdminLocaleCode;
  translated_name: string;
  translated_description: string;
  cached: boolean;
  provider: string;
  model: string;
}

/**
 * Response payload of
 * `POST /api/v1/admin/translate/menu-item/{id}/` and the category twin.
 */
export interface AITranslateMenuEntityResponse {
  item_id?: number;
  category_id?: number;
  translations: AITranslateEntityRow[];
  ai_provider: string;
}

/**
 * Response payload of `POST /api/v1/admin/describe/menu-item/{id}/`.
 * `regenerated` distinguishes "fresh AI text" from "the operator already
 * edited this row, so we returned the cached value untouched" (D-023).
 */
export interface AIDescribeItemResponse {
  item_id: number;
  locale: AdminLocaleCode;
  description: string;
  regenerated: boolean;
  is_edited: boolean;
  provider: string;
  model: string;
  confidence: string | null;
}

/**
 * Single row in the bulk-describe response. `generated=false` + `skipped=true`
 * means the row was already filled (operator-edited or fresh AI cache).
 * `skipped=true` with `description=null` is the "provider failed" path.
 */
export interface AIDescribeBulkRow {
  item_id: number;
  description: string | null;
  generated: boolean;
  skipped: boolean;
  provider?: string;
  model?: string;
  reason?: string;
  error?: string;
}

/**
 * Response payload of `POST /api/v1/admin/describe/bulk/`. The backend
 * wraps the list under `{ filter: { item_ids, total_requested } }` — we
 * surface both the `filter` object and a derived `count` for convenience.
 */
export interface AIDescribeBulkResponse {
  results: AIDescribeBulkRow[];
  total_generated: number;
  total_skipped: number;
  locale: AdminLocaleCode;
  filter: { item_ids: number[] | null; total_requested: number };
}

/**
 * Response payload of `GET /api/v1/admin/translate/stats/` (Sprint 9A bonus
 * endpoint, consumed by the Sprint 9B `TranslationGapPanel`).
 *
 * Note: the actual backend exposes `per_target_locale` / `per_provider` /
 * `supported_locales` rather than the spec's `cache_hit_rate` /
 * `coverage_pct` — we mirror the live contract so the panel renders the
 * right numbers out of the box.
 */
export interface AITranslateStatsResponse {
  translation_memory: {
    total: number;
    per_target_locale: Partial<Record<AdminLocaleCode, number>>;
    per_provider: Record<string, number>;
  };
  descriptions: {
    total: number;
    edited: number;
  };
  supported_locales: AdminLocaleCode[];
}

/**
 * Mirror of `apps.orders.models.OrderStatus`. Used by the loyalty/customer
 * detail page where the recent orders are inline JSON objects without a
 * cross-reference back to the orders module.
 */
export type AdminOrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

// ---------------------------------------------------------------------------
// Customer + Loyalty (Sprint 10C frontend — backend shipped in 10A)
// ---------------------------------------------------------------------------
//
// Backend URL prefix is `/api/v1/account/admin/...` (mounted via
// `apps.account.urls_admin`), NOT `/api/v1/admin/...` as the original
// Sprint 10C spec brief suggested. The 10A backend shipped under
// `account/` because the public + admin surfaces share the same models
// (Customer, LoyaltySettings, LoyaltyTransaction) — D-025.
//
// All shapes below mirror the actual 10A backend serializers. Where the
// spec brief asked for fields the backend does NOT expose yet, those are
// marked optional + a `__spec_drift__` comment block notes the gap.
// ---------------------------------------------------------------------------

/**
 * Loyalty transaction kind (mirrors `apps.account.models.TYPE_CHOICES`).
 *
 * `type` value pairs with the signed `points` column:
 *   - earn / adjust: positive
 *   - redeem / expire / reverse: negative
 */
export type LoyaltyTransactionType =
  | "earn"
  | "redeem"
  | "expire"
  | "adjust"
  | "reverse";

/**
 * Mirror of `apps.account.serializers.LoyaltyTransactionSerializer`.
 *
 * __spec_drift__: the 10C spec brief asked for `organization_name` and
 * `order_number`; the 10A serializer only exposes `order` (FK id) plus
 * `note`. The detail page renders the FK id when no order number is
 * available — operators can cross-reference from the linked `recent_orders`
 * list. If the backend later joins these fields, the renderer should
 * prefer them over the fallback.
 */
export interface LoyaltyTransactionAdmin {
  id: number;
  type: LoyaltyTransactionType;
  /** Signed integer — positive for earn/adjust, negative for redeem/expire/reverse. */
  points: number;
  /** Order FK id (10C spec fallback — backend does not denormalize order_number). */
  order: number | null;
  note: string;
  created_at: string;
}

/**
 * Mirror of the `recent_orders` block inside
 * `GET /api/v1/account/admin/customers/{id}/`.
 *
 * __spec_drift__: the 10C spec brief asked for `item_count`; the 10A
 * serializer deliberately returns only the order header (no items list)
 * for performance. Admin operators can drill into the linked order
 * detail page to see items.
 */
export interface OrderHistoryAdmin {
  id: number;
  order_number: string;
  status: AdminOrderStatus;
  total_amount: string;
  currency: string;
  placed_at: string;
}

/**
 * Customer profile block inside the admin detail payload.
 *
 * __spec_drift__: the 10C spec brief asked for `is_active`; the 10A
 * `CustomerProfileSerializer` exposes only id/email/full_name/phone plus
 * the two timestamps. `is_active` is intentionally NOT in the public
 * serializer (D-025) and the admin detail page falls back to a derived
 * "Aktif" badge based on the activity timestamps.
 */
export interface CustomerAdminProfile {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  created_at: string;
  last_login_at: string | null;
  /** 10C spec field — backend does not expose yet; UI derives from last_login_at. */
  is_active?: boolean;
}

/**
 * Loyalty summary block inside the admin detail payload.
 *
 * The backend returns a flat `loyalty_balance` int at the detail root
 * (org-scoped — V1 admin is single-org), not the spec's
 * `{ balance_by_org: [...] }` shape. The UI wraps it in a 1-element
 * "Per-organization" table so the spec surface is preserved for the
 * V2 multi-tenant upgrade.
 */
export interface CustomerAdminLoyalty {
  /** 10A backend flat field; spec brief called this `balance`. */
  loyalty_balance: number;
  /** V2 spec brief: per-org balance breakdown. For V1 we synthesize a
   *  single-entry list from the flat balance above (operator's own org). */
  balance_by_org: Array<{
    organization_id: number;
    organization_name: string;
    balance: number;
  }>;
  recent_transactions: LoyaltyTransactionAdmin[];
  recent_orders: OrderHistoryAdmin[];
}

/**
 * Full payload of `GET /api/v1/account/admin/customers/{id}/`.
 *
 * Wrapped by the backend in `{data, meta}` — the fetch layer unwraps.
 */
export interface CustomerAdminDetail {
  customer: CustomerAdminProfile;
  loyalty: CustomerAdminLoyalty;
}

/**
 * Mirror of `apps.account.serializers.CustomerAdminSummarySerializer` —
 * `GET /api/v1/account/admin/customers/`.
 *
 * __spec_drift__: the 10C spec brief asked for `total_orders` +
 * `last_order_at`; the 10A serializer only ships `loyalty_balance` plus
 * the standard profile fields. The list page hides the columns rather
 * than rendering bogus zeros.
 */
export interface CustomerAdminSummary {
  id: number;
  email: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  /** 10A field — spec brief called this `loyalty_balance_total`. */
  loyalty_balance: number;
  /** 10C spec field — backend does not expose yet. */
  total_orders?: number;
  /** 10C spec field — backend does not expose yet. */
  last_order_at?: string | null;
}

/** Paginated list envelope for `GET /api/v1/account/admin/customers/`. */
export interface CustomerAdminListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: CustomerAdminSummary[];
}

/** Payload for `POST /api/v1/account/admin/customers/{id}/loyalty-adjust/`. */
export interface LoyaltyAdjustRequest {
  /** Signed integer — positive adds points, negative deducts. Must be non-zero. */
  delta_points: number;
  note?: string;
}

/** Response payload for `POST .../loyalty-adjust/`. */
export interface LoyaltyAdjustResponse {
  transaction: LoyaltyTransactionAdmin;
  new_balance: number;
}

/**
 * Mirror of `apps.account.serializers.AdminLoyaltySettingsSerializer` —
 * `GET` / `PUT /api/v1/account/admin/loyalty/settings/`.
 *
 * __spec_drift__: the 10C spec brief asked for `id`, `organization`,
 * `created_at`, `updated_at`; the 10A serializer only ships the five
 * configurable fields. `id` and `organization` are optional here so the
 * UI can render an "unknown" badge if the backend ever starts returning
 * them — but the form below does not require them.
 */
export interface LoyaltySettingsAdmin {
  /** 10C spec field — backend does not expose yet. Optional for forward compat. */
  id?: number | null;
  /** 10C spec field — backend does not expose yet. Optional for forward compat. */
  organization?: number;
  is_enabled: boolean;
  /** Decimal serialized as string (e.g. "1.00"). */
  points_per_currency_unit: string;
  /** Decimal serialized as string (e.g. "0.10"). */
  redemption_rate: string;
  min_points_to_redeem: number;
  /** `null` = points never expire (Sprint 10A spec default). */
  points_expiry_days: number | null;
  /** 10C spec fields — backend does not expose yet. */
  created_at?: string;
  updated_at?: string;
}
