import { internalApiHeaders } from "@/lib/internal-api";
import { createTtlCache } from "@/lib/ttl-cache";
import type {
  LocaleCode,
  PublicMenuApiEnvelope,
  PublicMenuApiError,
  PublicMenuPayload,
} from "@/types/menu";

/**
 * PublicMenuError — thrown by fetchPublicMenu() so route segments can
 * decide between 404 / 500 render branches. Mirrors the backend's
 * `PublicMenuError` envelope shape (see apps/menu/views_public.py).
 */
export class PublicMenuError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "PublicMenuError";
    this.status = status;
    this.code = code;
  }
}

export interface FetchPublicMenuOptions {
  branch?: string;
  locale?: LocaleCode;
  /** Override the base URL (used by tests / Storybook). */
  baseUrl?: string;
  /** When true, uses INTERNAL_API_BASE_URL — used inside server components
   *  when running inside Docker so we hit the backend container directly
   *  over the internal network instead of looping back via the host. */
  internal?: boolean;
}

/**
 * Resolve the API base URL.
 *  - internal:true → INTERNAL_API_BASE_URL (server-side, Docker network)
 *  - else → NEXT_PUBLIC_API_BASE_URL (browser / dev host)
 *  - caller override wins
 */
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
 * Short-lived per-process cache of public menu payloads (ANALYSIS_1 F-05).
 *
 * The public menu is identical for every visitor (the request carries no
 * cookies), and generating it costs the backend hundreds of SQL queries for
 * a large menu. Caching it here means Django is hit at most once per
 * `PUBLIC_MENU_CACHE_TTL_SECONDS` per business/locale/branch per Next
 * process, no matter how many customers scan the QR code. Unlike Next's
 * Data Cache it never serves data older than the TTL (see `lib/ttl-cache`).
 *
 * `PUBLIC_MENU_CACHE_TTL_SECONDS`: default 10; `0` disables caching.
 * Menu edits made in the admin appear on the public page within that time.
 */
const publicMenuCache = createTtlCache<PublicMenuPayload>({ maxEntries: 500 });

function publicMenuCacheTtlMs(): number {
  const raw = process.env.PUBLIC_MENU_CACHE_TTL_SECONDS;
  const seconds = raw === undefined || raw.trim() === "" ? 10 : Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
}

/**
 * Fetch the full public menu payload for a business slug.
 *
 * Used by server components (route = app router) with `internal: true` so
 * the request hops directly to the `backend` service in Docker. The
 * browser never calls this directly — it consumes the rendered HTML.
 * Server-side calls identify themselves with `INTERNAL_API_TOKEN` so the
 * backend does not rate limit the whole site as a single visitor, and are
 * served from a short in-process cache (see `publicMenuCache`).
 */
export async function fetchPublicMenu(
  businessSlug: string,
  options: FetchPublicMenuOptions = {},
): Promise<PublicMenuPayload> {
  const { branch, locale, baseUrl, internal } = options;

  const params = new URLSearchParams();
  if (branch) params.set("branch", branch);
  if (locale) params.set("locale", locale);

  const base = resolveBaseUrl({ baseUrl, internal });
  const query = params.toString();
  const url = `${base.replace(/\/$/, "")}/api/v1/public/menus/${encodeURIComponent(
    businessSlug,
  )}${query ? `?${query}` : ""}`;

  const ttlMs = internal && !baseUrl ? publicMenuCacheTtlMs() : 0;
  return publicMenuCache.get(url, ttlMs, () => loadPublicMenu(url, internal));
}

async function loadPublicMenu(
  url: string,
  internal: boolean | undefined,
): Promise<PublicMenuPayload> {
  let res: Response;
  try {
    res = await fetch(url, {
      // Caching is handled by `publicMenuCache`, not by Next's Data Cache.
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(internal ? internalApiHeaders() : {}),
      },
    });
  } catch (err) {
    // Network-level failure (backend down, DNS, etc).
    throw new PublicMenuError(
      0,
      "network.error",
      err instanceof Error ? err.message : "Ağ hatası",
    );
  }

  if (!res.ok) {
    let body: PublicMenuApiError | null = null;
    try {
      body = (await res.json()) as PublicMenuApiError;
    } catch {
      // body wasn't JSON — fall through with a generic error.
    }
    throw new PublicMenuError(
      res.status,
      body?.error?.code ?? "unknown",
      body?.error?.message ?? `Beklenmeyen hata (HTTP ${res.status})`,
    );
  }

  const envelope = (await res.json()) as PublicMenuApiEnvelope;
  return envelope.data;
}
