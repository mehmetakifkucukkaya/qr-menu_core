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
  Allergen,
  ApiEnvelope,
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
  } = options;

  const base = resolveBaseUrl({ baseUrl, internal });
  const url = `${base.replace(/\/$/, "")}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...extraHeaders,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

  const envelope = (await res.json()) as ApiEnvelope<T>;
  return envelope.data;
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
 * Server-side: pass `internal: true` so we hit `backend` over the Docker
 * network. The browser never calls this directly — it consumes RSC output.
 */
export async function fetchOrganizations(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Organization[]> {
  return adminFetch<Organization[]>("/api/v1/admin/organizations/", {
    ...options,
  });
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

/** GET /api/v1/admin/theme/ — list theme configs the user can access. */
export async function fetchThemeConfigs(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<ThemeConfig[]> {
  return adminFetch<ThemeConfig[]>("/api/v1/admin/theme/", {
    ...options,
  });
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

/** GET /api/v1/admin/allergens/ — list all allergens (global, not tenant-scoped). */
export async function fetchAllergens(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<Allergen[]> {
  const data = await adminFetch<{ count: number; results: Allergen[] }>(
    "/api/v1/admin/allergens/",
    { ...options },
  );
  return data.results ?? [];
}

/** GET /api/v1/admin/dietary-tags/ — list all dietary tags. */
export async function fetchDietaryTags(
  options: Pick<AdminFetchOptions, "baseUrl" | "internal" | "cookieHeader"> = {},
): Promise<DietaryTag[]> {
  const data = await adminFetch<{ count: number; results: DietaryTag[] }>(
    "/api/v1/admin/dietary-tags/",
    { ...options },
  );
  return data.results ?? [];
}
