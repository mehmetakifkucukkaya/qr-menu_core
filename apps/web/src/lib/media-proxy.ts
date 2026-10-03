/**
 * Path validation for the `/media` proxy route.
 *
 * `app/media/[...path]/route.ts` forwards `GET /media/<path>` to the Django
 * backend so uploaded photos load on whatever origin serves the site, without
 * Caddy in front (local dev, preview, the e2e harness). In production Caddy
 * answers `/media/*` itself and this route is never reached.
 *
 * Because it is a public, unauthenticated file proxy, the request path is
 * treated as hostile input:
 *   - only `/media/<one or more segments>` is accepted;
 *   - every segment, AFTER percent-decoding, must be a plain file or folder name
 *     (no `.` / `..`, no slash or backslash — `%2F`, `%5C`, `%2e%2e` included —
 *     and no control characters or NUL);
 *   - the result must still sit on the configured backend origin.
 * Segments are forwarded exactly as received (still percent-encoded) so a file
 * name with an encoded space or accent is not double-encoded.
 *
 * Pure and dependency-free: the unit test runs it straight in Node.
 */

const MAX_SEGMENTS = 8;
const MAX_PATH_LENGTH = 400;
const PREFIX = "/media/";

// Characters that must never survive decoding: path separators and C0 controls.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\\/\u0000-\u001f\u007f]/;

/**
 * Backend URL for a request pathname such as `/media/uploads/1/a.jpg`, or
 * `null` when the pathname is not a safe media path.
 */
export function resolveMediaUpstream(base: string, pathname: string): URL | null {
  if (!pathname.startsWith(PREFIX) || pathname.length > MAX_PATH_LENGTH) return null;

  const rawSegments = pathname.slice(PREFIX.length).split("/");
  if (rawSegments.length === 0 || rawSegments.length > MAX_SEGMENTS) return null;

  for (const raw of rawSegments) {
    if (raw === "") return null; // "//" or a trailing slash
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return null; // malformed % escape
    }
    if (decoded === "." || decoded === ".." || FORBIDDEN.test(decoded)) return null;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(base);
  } catch {
    return null;
  }

  const upstream = new URL(`${PREFIX}${rawSegments.join("/")}`, baseUrl);
  // Defence in depth: still the configured backend, still under /media/.
  if (upstream.origin !== baseUrl.origin || !upstream.pathname.startsWith(PREFIX)) {
    return null;
  }
  return upstream;
}

/** The proxy only ever serves pictures; uploaded PDFs etc. stay private. */
export function isImageContentType(contentType: string | null): boolean {
  return Boolean(contentType && /^image\/(jpeg|png|webp|gif|avif)\b/i.test(contentType));
}
