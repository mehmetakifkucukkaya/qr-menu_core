/**
 * Public event tracker — Sprint 5B.
 *
 * The public menu page fires anonymous analytics events to the backend so
 * operators can see real usage (menu views, language changes, WhatsApp /
 * phone clicks, QR scans). The backend endpoint is unauthenticated, POST
 * only, throttled at 30/min/IP, and silently 204s on unknown org slugs.
 *
 * Contract (POST /api/v1/public/events):
 *   {
 *     event_type:     "menu_view" | "language_change" | "whatsapp_click"
 *                   | "phone_click" | "qr_open"
 *     locale:         "tr" | "en"  (default "tr")
 *     path:           string       (window.location.pathname, ≤ 500 chars)
 *     organization_slug: string    (from /m/{slug} URL)
 *     qr_id?:         number       (when ?qr=N is present)
 *     ...payload      (forwarded to backend — unknown fields are dropped)
 *   }
 *
 * Why a dedicated module?
 *   - Single source of truth for the EventType union — kept in sync with
 *     `apps.analytics.models.MenuViewEvent.EVENT_CHOICES`.
 *   - Silent failure: an analytics hiccup must NEVER break the public
 *     page (no console spam, no thrown errors). We wrap the fetch in
 *     try/catch and swallow.
 *   - SSR safe: `typeof window === "undefined"` short-circuits the whole
 *     call so server-rendered code paths can `await trackEvent(...)`
 *     without crashing (though in practice the only call sites are in
 *     client components / effects).
 */

export type EventType =
  | "menu_view"
  | "language_change"
  | "whatsapp_click"
  | "phone_click"
  | "qr_open";

/**
 * Returns the public API base URL for browser-side fetch. Falls back to
 * the canonical local dev backend port when the env var is missing.
 */
function getApiBase(): string {
  // NEXT_PUBLIC_* vars are inlined at build time and exposed to the
  // browser bundle. No server-only `INTERNAL_*` is used here because
  // event tracking runs in the browser only.
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"
  ).replace(/\/+$/, "");
}

/**
 * Extracts the `{slug}` segment from `/m/{slug}` URLs. Returns `null`
 * when the current path is not a public menu page — we silently bail
 * in that case (analytics never breaks unrelated pages).
 */
function getOrgSlugFromPath(): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.pathname.match(/^\/m\/([a-z0-9-]+)/);
  return match ? match[1] : null;
}

/**
 * Resolves the active locale for the analytics event. Preference order:
 *   1. `?locale=` query param (the only locale selector mechanism today)
 *   2. `<html lang>` attribute (set by middleware if present)
 *   3. "tr" (default)
 */
function getCurrentLocale(): string {
  if (typeof window === "undefined") return "tr";
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("locale");
    if (fromQuery === "tr" || fromQuery === "en") return fromQuery;
    const fromHtml = document.documentElement?.lang;
    if (fromHtml === "tr" || fromHtml === "en") return fromHtml;
  } catch {
    // Defensive: URL parsing can throw on malformed input.
  }
  return "tr";
}

/**
 * Reads `?qr=` as an integer, or returns undefined when absent / invalid.
 * The backend stores this as `qr_code_id` on the event for later aggregation.
 */
function getQrId(): number | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = new URLSearchParams(window.location.search).get("qr");
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Fire-and-forget analytics POST.
 *
 * Returns a resolved promise so callers don't have to `.catch()`. The
 * function never throws — exceptions are caught and dropped silently.
 *
 * Usage:
 *   useEffect(() => { trackEvent("menu_view"); }, []);
 *   <a onClick={() => trackEvent("whatsapp_click")} ...>
 */
export async function trackEvent(
  eventType: EventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  // SSR guard — no-op on the server.
  if (typeof window === "undefined") return;

  // Don't even try if we're not on a public menu page (e.g. admin pages
  // accidentally importing this).
  const orgSlug = getOrgSlugFromPath();
  if (!orgSlug) return;

  const body = {
    event_type: eventType,
    locale: getCurrentLocale(),
    path: window.location.pathname.slice(0, 500),
    organization_slug: orgSlug,
    qr_id: getQrId(),
    ...payload,
  };

  try {
    await fetch(`${getApiBase()}/api/v1/public/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // keepalive lets the request outlive the page when the user
      // closes the tab right after clicking WhatsApp / phone.
      keepalive: true,
      // No credentials — the public events endpoint is anonymous.
      credentials: "omit",
    });
  } catch {
    // Silent fail. Analytics outages must never break UX.
  }
}