/**
 * Admin API client — Sprint 4A.
 *
 * Mirrors the patterns of `lib/api.ts` (public menu) but scoped to the
 * authenticated, cookie-based admin endpoints. Every request uses
 * `credentials: "include"` so the browser sends the `qr_sessionid` and
 * `qr_csrftoken` cookies automatically. CSRF is enforced by Django for
 * unsafe methods (POST/PATCH/DELETE) via `SessionAuthentication`, so the
 * client must first GET `/api/v1/auth/csrf` to seed the cookie, then
 * echo the token in the `X-CSRFToken` header on the next POST.
 *
 * Server components fetch with `internal: true` so the request hops
 * straight to the `backend` service in Docker and the cookies travel via
 * the Next.js `cookies()` store (set up in the (admin) layout).
 */

import type {
  AdminMenu,
  AdminMenuCategory,
  AdminMenuItem,
  AdminLocaleCode,
  AdminQRCode,
  AdminSummary,
  Allergen,
  ApiEnvelope,
  Branch,
  CsrfResponse,
  CurrentUser,
  DietaryTag,
  MenuTranslation,
  Organization,
  ThemeConfig,
} from "@/types/admin";

/**
 * AdminApiError — mirrors PublicMenuError. Thrown so route segments /
 * server components can branch on status code.
 */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.code = code;
  }
}

interface AdminFetchOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** CSRF token to echo in the X-CSRFToken header (required for unsafe methods). */
  csrfToken?: string;
  body?: unknown;
  /** Override the base URL (tests / Storybook). */
  baseUrl?: string;
  /** Server-side: hit the backend container directly via Docker network. */
  internal?: boolean;
  /** Optional cookies to attach when calling from a server component
   *  (e.g. `cookies()` from `next/headers`). Browser requests don't need
   *  this — credentials: "include" handles it. */
  cookieHeader?: string;
  /** Optional extra headers. */
  headers?: Record<string, string>;
  /**
   * Set to true when the caller supplies a `FormData` (or `Blob`) as `body`.
   * The fetch layer must NOT inject `Content-Type: application/json` and
   * must NOT call `JSON.stringify` — the browser serializes multipart
   * payloads with the right `boundary` itself. Only relevant on the
   * browser side (RSC never sends FormData).
   */
  formData?: boolean;
}

function resolveBaseUrl(opts: { baseUrl?: string; internal?: boolean }): string {
  if (opts.baseUrl) return opts.baseUrl;
  if (opts.internal) {
    return process.env.INTERNAL_API_BASE_URL || "http://backend:8000";
  }
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.INTERNAL_API_BASE_URL ||
    "http://localhost:8000"
  );
}

/**
 * Low-level admin fetch — used by all the typed wrappers below. Handles:
 *  - base URL resolution (internal vs. browser)
 *  - credentials: include (browser) OR forwarded cookie header (server RSC)
 *  - X-CSRFToken header for unsafe methods
 *  - JSON envelope unwrapping (`{ data }`) and typed error throwing
 */
export async function adminFetch<T>(
  path: string,
  options: AdminFetchOptions = {},
): Promise<T> {
  const {
    method = "GET",
    csrfToken,
    body,
    baseUrl,
    internal,
    cookieHeader,
    headers: extraHeaders,
    formData = false,
  } = options;

  const base = resolveBaseUrl({ baseUrl, internal });
  const url = `${base.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extraHeaders,
  };
  // Only set Content-Type when the caller is sending a JSON body. For
  // FormData / Blob payloads the browser must pick the multipart boundary
  // itself — overriding Content-Type would break the request.
  if (body !== undefined && !formData) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body:
        body === undefined
          ? undefined
          : formData
            ? (body as BodyInit) // FormData / Blob passed through verbatim
            : JSON.stringify(body),
      // Admin payloads are dynamic — never cache.
      cache: "no-store",
    });
  } catch (err) {
    throw new AdminApiError(
      0,
      "network.error",
      err instanceof Error ? err.message : "Ağ hatası",
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let errCode = "unknown";
    let errMessage = `Beklenmeyen hata (HTTP ${res.status})`;
    try {
      const errBody = (await res.json()) as
        | { error?: { code: string; message: string } }
        | { detail?: string };
      if ("error" in errBody && errBody.error) {
        errCode = errBody.error.code;
        errMessage = errBody.error.message;
      } else if ("detail" in errBody && typeof errBody.detail === "string") {
        // DRF's default error shape (e.g. permission denied).
        errCode = res.status === 401 ? "auth.unauthenticated" : "api.error";
        errMessage = errBody.detail;
      }
    } catch {
      // body wasn't JSON — fall through with generic message.
    }
    throw new AdminApiError(res.status, errCode, errMessage);
  }

  const payload = (await res.json()) as unknown;
  // Two response shapes coexist in the backend today:
  //   1. Custom _wrap() — { data, meta }      (menus, categories, menu-items lists + details)
  //   2. DRF default    — raw object / paginated { count, results, ... }
  //                      (organizations, theme, allergens, dietary-tags lists + detail retrieves)
  // Tolerate both: unwrap when `data` is present, otherwise return the
  // raw payload cast to T. The wrappers that need `count/next/previous`
  // (lists) inspect the response shape themselves.
  if (
    payload !== null &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    !("count" in (payload as Record<string, unknown>)) &&
    !("results" in (payload as Record<string, unknown>))
  ) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** GET /api/v1/auth/csrf — seeds the qr_csrftoken cookie and returns the token. */
export async function fetchCsrfToken(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<string> {
  const body = await adminFetch<CsrfResponse>("/api/v1/auth/csrf", {
    ...options,
  });
  return body.csrfToken;
}

/**
 * POST /api/v1/auth/login — establishes the session cookie.
 * Browser callers pass `csrfToken` from the preceding `fetchCsrfToken()` call.
 * Server components don't need it (Django sets the cookie via CSRF middleware
 * exemption on this view? — actually we DO need to send it).
 */
export async function login(
  email: string,
  password: string,
  csrfToken: string,
  options: Pick<AdminFetchOptions, "baseUrl"> = {},
): Promise<CurrentUser> {
  return adminFetch<CurrentUser>("/api/v1/auth/login", {
    method: "POST",
    csrfToken,
    body: { email, password },
    ...options,
  });
}

/** POST /api/v1/auth/logout — clears the session cookie. */
export async function logout(
  csrfToken: string,
  options: Pick<AdminFetchOptions, "baseUrl" | "cookieHeader"> = {},
): Promise<void> {
  await adminFetch<void>("/api/v1/auth/logout", {
    method: "POST",
    csrfToken,
    ...options,
  });
}

/** GET /api/v1/me — returns the current user JSON (or throws 401). */
export async function fetchCurrentUser(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<CurrentUser> {
  return adminFetch<CurrentUser>("/api/v1/me", { ...options });
}

// ---------------------------------------------------------------------------
// Organization / Branch
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/organizations/ — list organizations the user is a
 * member of. V1 typically has exactly one organization per user.
 *
 * NOTE: this endpoint uses DRF's default ModelViewSet.list() (no custom
 * `_wrap` envelope), so the response is a raw paginated payload:
 *   { count, next, previous, results: Organization[] }
 * adminFetch is envelope-tolerant — it returns the raw payload cast to T.
 *
 * Server-side: pass `internal: true` so we hit `backend` over the Docker
 * network. The browser never calls this directly — it consumes RSC output.
 */
export async function fetchOrganizations(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Organization[]> {
  const data = await adminFetch<{ count: number; results: Organization[] }>(
    "/api/v1/admin/organizations/",
    { ...options },
  );
  return data.results ?? [];
}

/** Convenience — picks the user's first (and usually only) organization. */
export async function fetchCurrentOrganization(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Organization> {
  const orgs = await fetchOrganizations(options);
  const org = orgs[0];
  if (!org) {
    throw new AdminApiError(
      404,
      "organization.not_found",
      "Henüz bir işletme oluşturulmamış.",
    );
  }
  return org;
}

/** PATCH /api/v1/admin/organizations/{id}/ — partial org update. */
export async function updateOrganization(
  id: number,
  payload: Partial<Organization>,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<Organization> {
  return adminFetch<Organization>(`/api/v1/admin/organizations/${id}/`, {
    method: "PATCH",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/theme/ — list theme configs the user can access.
 *
 * NOTE: this endpoint uses DRF's default ModelViewSet.list() (no custom
 * `_wrap` envelope), so the response is a raw paginated payload. */
export async function fetchThemeConfigs(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<ThemeConfig[]> {
  const data = await adminFetch<{ count: number; results: ThemeConfig[] }>(
    "/api/v1/admin/theme/",
    { ...options },
  );
  return data.results ?? [];
}

/** Convenience — picks the first theme config (V1: one per org). */
export async function fetchCurrentTheme(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<ThemeConfig | null> {
  const configs = await fetchThemeConfigs(options);
  return configs[0] ?? null;
}

/** PATCH /api/v1/admin/theme/{id}/ — partial theme update. */
export async function updateTheme(
  id: number,
  payload: Partial<ThemeConfig>,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<ThemeConfig> {
  return adminFetch<ThemeConfig>(`/api/v1/admin/theme/${id}/`, {
    method: "PATCH",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

/** POST /api/v1/admin/theme/ — create a theme config (rare; orgs seed
 *  their default config via the backend management command). */
export async function createTheme(
  payload: Partial<ThemeConfig> & { organization_id: number },
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<ThemeConfig> {
  return adminFetch<ThemeConfig>("/api/v1/admin/theme/", {
    method: "POST",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Menu CRUD
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/menus/ — paginated list of menus. */
export async function fetchMenus(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminMenu[]> {
  // The menu list endpoint returns a paginated envelope; we extract .results.
  const data = await adminFetch<{ count: number; results: AdminMenu[] }>(
    "/api/v1/admin/menus/",
    { ...options },
  );
  return data.results ?? [];
}

/** GET /api/v1/admin/menus/{id}/ — single menu (with nested org/branch). */
export async function fetchMenu(
  id: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminMenu> {
  return adminFetch<AdminMenu>(`/api/v1/admin/menus/${id}/`, { ...options });
}

export interface CreateMenuPayload {
  organization_id: number;
  branch_id?: number | null;
  name: string;
  slug?: string;
  description?: string;
  default_locale: AdminLocaleCode;
  supported_locales: AdminLocaleCode[];
  is_active: boolean;
}

/** POST /api/v1/admin/menus/ — create a new menu. */
export async function createMenu(
  payload: CreateMenuPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminMenu> {
  return adminFetch<AdminMenu>("/api/v1/admin/menus/", {
    method: "POST",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

export interface UpdateMenuPayload {
  branch_id?: number | null;
  name?: string;
  slug?: string;
  description?: string;
  default_locale?: AdminLocaleCode;
  supported_locales?: AdminLocaleCode[];
  is_active?: boolean;
}

/** PATCH /api/v1/admin/menus/{id}/ — partial menu update. */
export async function updateMenu(
  id: number,
  payload: UpdateMenuPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminMenu> {
  return adminFetch<AdminMenu>(`/api/v1/admin/menus/${id}/`, {
    method: "PATCH",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

/** DELETE /api/v1/admin/menus/{id}/ — delete a menu. */
export async function deleteMenu(
  id: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<void> {
  await adminFetch<void>(`/api/v1/admin/menus/${id}/`, {
    method: "DELETE",
    csrfToken: options.csrfToken,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// MenuCategory CRUD
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/categories/?menu={id} — list categories for a menu. */
export async function fetchCategories(
  menuId: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminMenuCategory[]> {
  const data = await adminFetch<{ count: number; results: AdminMenuCategory[] }>(
    `/api/v1/admin/categories/?menu=${menuId}`,
    { ...options },
  );
  return data.results ?? [];
}

export interface CreateCategoryPayload {
  menu_id: number;
  parent_id?: number | null;
  name: string;
  slug?: string;
  description?: string;
  sort_order?: number;
  is_active: boolean;
  /** Absolute URL (e.g. returned by /api/v1/admin/media/upload). */
  image?: string;
  translations?: MenuTranslation[];
}

/** POST /api/v1/admin/categories/ — create a category. */
export async function createCategory(
  payload: CreateCategoryPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminMenuCategory> {
  return adminFetch<AdminMenuCategory>("/api/v1/admin/categories/", {
    method: "POST",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

export interface UpdateCategoryPayload {
  parent_id?: number | null;
  name?: string;
  slug?: string;
  description?: string;
  sort_order?: number;
  is_active?: boolean;
  /** Absolute URL (e.g. returned by /api/v1/admin/media/upload). */
  image?: string;
  translations?: MenuTranslation[];
}

/** PATCH /api/v1/admin/categories/{id}/ — partial category update. */
export async function updateCategory(
  id: number,
  payload: UpdateCategoryPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminMenuCategory> {
  return adminFetch<AdminMenuCategory>(`/api/v1/admin/categories/${id}/`, {
    method: "PATCH",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

/** DELETE /api/v1/admin/categories/{id}/ — delete a category. */
export async function deleteCategory(
  id: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<void> {
  await adminFetch<void>(`/api/v1/admin/categories/${id}/`, {
    method: "DELETE",
    csrfToken: options.csrfToken,
    ...options,
  });
}

/** POST /api/v1/admin/categories/reorder — reorder categories for a menu. */
export async function reorderCategories(
  menuId: number,
  orderedIds: number[],
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<{ updated: number; menu_id: number }> {
  return adminFetch<{ updated: number; menu_id: number }>(
    "/api/v1/admin/categories/reorder",
    {
      method: "POST",
      csrfToken: options.csrfToken,
      body: { menu_id: menuId, ordered_ids: orderedIds },
      ...options,
    },
  );
}

// ---------------------------------------------------------------------------
// MenuItem CRUD
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/menu-items/?category={id} — list items for a category. */
export async function fetchItems(
  categoryId: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminMenuItem[]> {
  const data = await adminFetch<{ count: number; results: AdminMenuItem[] }>(
    `/api/v1/admin/menu-items/?category=${categoryId}`,
    { ...options },
  );
  return data.results ?? [];
}

/** GET /api/v1/admin/menu-items/?menu={id} — list items for a menu (admin convenience). */
export async function fetchItemsByMenu(
  menuId: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminMenuItem[]> {
  const data = await adminFetch<{ count: number; results: AdminMenuItem[] }>(
    `/api/v1/admin/menu-items/?menu=${menuId}`,
    { ...options },
  );
  return data.results ?? [];
}

export interface CreateItemPayload {
  menu_id: number;
  category_id: number;
  name: string;
  description?: string;
  /** Decimal-as-string (e.g. "12.50"). The backend will coerce. */
  price: string;
  compare_at_price?: string | null;
  currency: string;
  is_active: boolean;
  is_available: boolean;
  is_featured?: boolean;
  is_popular?: boolean;
  is_new?: boolean;
  spice_level?: number;
  sort_order?: number;
  allergen_ids?: number[];
  dietary_tag_ids?: number[];
  /** Absolute URL (e.g. returned by /api/v1/admin/media/upload). */
  image?: string;
  translations?: MenuTranslation[];
}

/** POST /api/v1/admin/menu-items/ — create an item. */
export async function createItem(
  payload: CreateItemPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminMenuItem> {
  return adminFetch<AdminMenuItem>("/api/v1/admin/menu-items/", {
    method: "POST",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

export interface UpdateItemPayload {
  category_id?: number;
  name?: string;
  description?: string;
  price?: string;
  compare_at_price?: string | null;
  currency?: string;
  is_active?: boolean;
  is_available?: boolean;
  is_featured?: boolean;
  is_popular?: boolean;
  is_new?: boolean;
  spice_level?: number;
  sort_order?: number;
  allergen_ids?: number[];
  dietary_tag_ids?: number[];
  /** Absolute URL (e.g. returned by /api/v1/admin/media/upload). */
  image?: string;
  translations?: MenuTranslation[];
}

/** PATCH /api/v1/admin/menu-items/{id}/ — partial item update (price toggle, etc). */
export async function updateItem(
  id: number,
  payload: UpdateItemPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminMenuItem> {
  return adminFetch<AdminMenuItem>(`/api/v1/admin/menu-items/${id}/`, {
    method: "PATCH",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

/** DELETE /api/v1/admin/menu-items/{id}/ — delete an item. */
export async function deleteItem(
  id: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<void> {
  await adminFetch<void>(`/api/v1/admin/menu-items/${id}/`, {
    method: "DELETE",
    csrfToken: options.csrfToken,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Reference data (Allergen, DietaryTag)
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/allergens/ — list all allergens (global, not tenant-scoped).
 *
 * NOTE: ReadOnlyModelViewSet uses DRF's default list, so the response
 * is a raw paginated payload (no `{ data, meta }` envelope). */
export async function fetchAllergens(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Allergen[]> {
  const data = await adminFetch<{ count: number; results: Allergen[] }>(
    "/api/v1/admin/allergens/",
    { ...options },
  );
  return data.results ?? [];
}

/** GET /api/v1/admin/dietary-tags/ — list all dietary tags. Same shape
 *  as fetchAllergens (raw paginated payload). */
export async function fetchDietaryTags(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<DietaryTag[]> {
  const data = await adminFetch<{ count: number; results: DietaryTag[] }>(
    "/api/v1/admin/dietary-tags/",
    { ...options },
  );
  return data.results ?? [];
}

// ---------------------------------------------------------------------------
// Admin summary (Sprint 4C)
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/summary — dashboard metrics + last 10 audit events.
 *  Envelope-tolerant: accepts both `{data, meta}` and raw body. */
export async function fetchAdminSummary(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminSummary> {
  return adminFetch<AdminSummary>("/api/v1/admin/summary/", { ...options });
}

// ---------------------------------------------------------------------------
// Media upload (Sprint 5A backend — consumed in 5B frontend)
// ---------------------------------------------------------------------------

/**
 * Response payload of `POST /api/v1/admin/media/upload`. The backend
 * stores the file under MEDIA_ROOT/uploads/{organization_id}/ and
 * returns the publicly-fetchable URL so the admin form can drop it
 * straight into MenuItem.image / Organization.logo / etc.
 *
 * NOTE: `organization_id` is included in the envelope so the parent
 * form can confirm the upload was scoped to the correct tenant in
 * tenant-isolation smoke tests.
 */
export interface MediaUploadResponse {
  url: string;
  filename: string;
  size: number;
  content_type: string;
  organization_id: number;
}

/**
 * POST /api/v1/admin/media/upload — multipart file upload.
 *
 * Sends a single `file` field as `multipart/form-data`. Validation
 * (mime / size / extension) happens server-side; this wrapper just
 * surfaces the resulting 4xx as `AdminApiError` with the appropriate
 * `code` (`media.invalid_type`, `media.too_large`, `media.missing_file`,
 * `media.no_organization`, …).
 *
 * The browser owns the multipart boundary — we deliberately do NOT set
 * `Content-Type: multipart/form-data` ourselves (see adminFetch's
 * `formData: true` branch).
 */
export async function uploadMedia(
  file: File,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return adminFetch<MediaUploadResponse>(
    "/api/v1/admin/media/upload",
    {
      method: "POST",
      csrfToken: options.csrfToken,
      body: formData,
      formData: true,
      ...options,
    },
  );
}

// ---------------------------------------------------------------------------
// Branches (Sprint 5B)
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/branches/ — paginated list of branches the current
 * user can access (tenant-scoped via `Branch.objects.for_user(user)`).
 *
 * NOTE: Default DRF ModelViewSet list response — raw paginated payload,
 * `{count, next, previous, results: Branch[]}` (no custom `_wrap`).
 * `adminFetch` is envelope-tolerant and returns the raw payload, so we
 * just pull `results` here.
 *
 * V1 lookup helper for the QR management UI (QR codes can be attached
 * to one org branch or left org-wide).
 */
export async function fetchBranches(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Branch[]> {
  const data = await adminFetch<{ count: number; results: Branch[] }>(
    "/api/v1/admin/branches/",
    { ...options },
  );
  return data.results ?? [];
}

// ---------------------------------------------------------------------------
// QR Codes (Sprint 5B frontend — backend shipped in 5A)
// ---------------------------------------------------------------------------

/**
 * GET /api/v1/admin/qr-codes/ — list the current user's QR codes.
 *
 * Each row in V1 has:
 *   - id                  — used in the detail/download URLs
 *   - organization        — read-only nested summary
 *   - branch              — read-only nested summary or null
 *   - menu                — read-only nested summary
 *   - label               — operator-facing name (e.g. "Kasa Önü")
 *   - target_url          — public menu URL, computed server-side
 *   - table_number        — optional, plain text
 *   - scan_count          — incremented by the analytics pipeline
 *   - is_active           — soft-delete flag (DELETE flips to false)
 *
 * Tenant scoping: handled server-side via `QRCode.objects.for_user(user)`,
 * the client doesn't pass any filter — every call is implicitly tenant-safe.
 */
export async function fetchQRCodes(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminQRCode[]> {
  const data = await adminFetch<{ count: number; results: AdminQRCode[] }>(
    "/api/v1/admin/qr-codes/",
    { ...options },
  );
  return data.results ?? [];
}

/** GET /api/v1/admin/qr-codes/{id}/ — retrieve a single QR code. */
export async function fetchQRCode(
  id: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AdminQRCode> {
  return adminFetch<AdminQRCode>(`/api/v1/admin/qr-codes/${id}/`, { ...options });
}

/**
 * Payload for `POST /api/v1/admin/qr-codes/`.
 *
 * - `organization_id` is required (the QR belongs to one tenant; for V1 we
 *   accept it from the form but fall back to the user's current org if the
 *   caller leaves it out).
 * - `branch_id` is optional — leaving it absent (or passing `null`) makes
 *   the QR target the org-wide menu.
 * - `table_number` is optional free-text (max 20 chars server-side).
 * - `is_active` defaults to `true` (active).
 */
export interface CreateQRPayload {
  organization_id: number;
  menu_id: number;
  branch_id?: number | null;
  label: string;
  table_number?: string;
  is_active?: boolean;
}

/** POST /api/v1/admin/qr-codes/ — create a new QR code. */
export async function createQRCode(
  payload: CreateQRPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminQRCode> {
  return adminFetch<AdminQRCode>("/api/v1/admin/qr-codes/", {
    method: "POST",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

/**
 * Payload for `PATCH /api/v1/admin/qr-codes/{id}/`.
 *
 * V1 only lets the operator edit `label`, `table_number`, and the
 * `is_active` flag (target_url, scan_count, FKs are read-only server-side
 * — changing the menu/branch would re-encode the PNG anyway, so the
 * recommended path is "soft delete + create a new one").
 */
export interface UpdateQRPayload {
  label?: string;
  table_number?: string;
  is_active?: boolean;
}

/** PATCH /api/v1/admin/qr-codes/{id}/ — partial update of label / active / table. */
export async function updateQRCode(
  id: number,
  payload: UpdateQRPayload,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<AdminQRCode> {
  return adminFetch<AdminQRCode>(`/api/v1/admin/qr-codes/${id}/`, {
    method: "PATCH",
    csrfToken: options.csrfToken,
    body: payload,
    ...options,
  });
}

/**
 * DELETE /api/v1/admin/qr-codes/{id}/ — soft delete (is_active=false).
 *
 * Returns 204; the row is preserved for analytics history. The backend
 * rejects DELETE on already-inactive rows with 404 — we surface this as
 * `AdminApiError("qr.not_found", …)` for callers.
 */
export async function deleteQRCode(
  id: number,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader" | "csrfToken"> = {},
): Promise<void> {
  await adminFetch<void>(`/api/v1/admin/qr-codes/${id}/`, {
    method: "DELETE",
    csrfToken: options.csrfToken,
    ...options,
  });
}

/**
 * Resolves the absolute URL of the QR PNG download endpoint. Browser
 * fetches to this endpoint automatically include the `qr_sessionid`
 * cookie thanks to `SameSite=Lax` + same-site (different ports on
 * `localhost` are same-site per spec). For server-side fetches inside RSC
 * we'd need to forward the cookie header (not currently needed — the
 * preview page renders the URL into an `<img src>`).
 */
export function qrDownloadUrl(id: number): string {
  const base = (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.INTERNAL_API_BASE_URL ||
    "http://localhost:8000"
  ).replace(/\/$/, "");
  return `${base}/api/v1/admin/qr-codes/${id}/download`;
}

// ---------------------------------------------------------------------------
// Analytics overview (Sprint 5B-2 — backend shipped in 5A)
// ---------------------------------------------------------------------------

/**
 * EventType union — mirrors `apps.analytics.models.MenuViewEvent.EVENT_CHOICES`.
 * The backend serializes the same snake_case identifiers in `event_counts`,
 * so the keys of `AnalyticsEventCounts` are exactly this union.
 */
export type AnalyticsEventType =
  | "menu_view"
  | "language_change"
  | "whatsapp_click"
  | "phone_click"
  | "qr_open";

/**
 * Per-event-type counts over the chosen window. Backend always returns
 * all five keys (zero when no events exist) — see `TODAY_EVENT_TYPES`
 * in `apps/analytics/views_admin.py`.
 */
export interface AnalyticsEventCounts {
  menu_view: number;
  language_change: number;
  whatsapp_click: number;
  phone_click: number;
  qr_open: number;
}

/** Top QR code row from the analytics overview (id + label + scan count). */
export interface AnalyticsTopQRCode {
  id: number;
  label: string;
  scan_count: number;
}

/** Single day in the daily views time-series. */
export interface AnalyticsDailyView {
  /** ISO date "YYYY-MM-DD" (TruncDate result). */
  date: string;
  count: number;
}

/**
 * Response payload of `GET /api/v1/admin/analytics/overview`.
 *
 * Backend returns this wrapped in `{ data, meta }` — `adminFetch`
 * unwraps automatically (no `count`/`results` keys present).
 *
 * All counts are tenant-scoped via `IsOrganizationMember` + the user's
 * `Membership.organization` — the frontend never passes an `org_id`
 * filter.
 */
export interface AnalyticsOverview {
  today_views: number;
  week_views: number;
  month_views: number;
  event_counts: AnalyticsEventCounts;
  /** Locale → ratio (0..1). Keys present only when at least one event
   *  exists in the window (backend skips empty windows). */
  language_distribution: Record<string, number>;
  top_qr_codes: AnalyticsTopQRCode[];
  daily_views: AnalyticsDailyView[];
}

/**
 * GET /api/v1/admin/analytics/overview?days={N}
 *
 * Dashboard payload used by `/admin/analytics`. `days` defaults to 30
 * (mirroring backend default). The backend clamps the window to
 * [1, 90] so passing larger values is safe.
 *
 * Tenant-safe — the backend resolves the organization from the session
 * cookie. Errors surface as `AdminApiError` with the same codes used by
 * every other admin endpoint (`auth.unauthenticated`, `api.error`, …).
 */
export async function fetchAnalyticsOverview(
  days: number = 30,
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<AnalyticsOverview> {
  const safeDays = Math.max(1, Math.min(90, Math.floor(Number(days) || 30)));
  return adminFetch<AnalyticsOverview>(
    `/api/v1/admin/analytics/overview?days=${safeDays}`,
    { ...options },
  );
}
