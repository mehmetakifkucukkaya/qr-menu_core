/**
 * Uploaded-image URLs.
 *
 * Uploaded files live under `/media/…` and are meant to be served from the SAME
 * origin as the site: by Caddy in production, by the `/media` proxy route
 * (`app/media/[...path]/route.ts`) everywhere else (dev, preview, e2e).
 *
 * Older rows saved an ABSOLUTE url built from whatever host the API happened to
 * see at upload time, e.g. `http://localhost:3000/media/uploads/1/x.jpg`. A
 * loopback host is only valid on one machine and one port, so every other
 * visitor, port or tunnel got a 404 — the "broken image" on dishes that did have
 * a photo. Dropping the origin makes the browser resolve the path against the
 * page it is on instead.
 *
 * Deliberately narrow: only loopback hosts with a `/media/` path are rewritten.
 * Real hostnames (the production origin, a CDN, S3/R2), relative paths and
 * data / blob URLs are returned untouched.
 *
 * Pure and deterministic, so server and client render the same `src`
 * (no hydration mismatch). No imports: the unit test runs it straight in Node.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

export function mediaSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("data:") || url.startsWith("blob:")) {
    return url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  const isHttp = parsed.protocol === "http:" || parsed.protocol === "https:";
  if (isHttp && LOOPBACK_HOSTS.has(parsed.hostname) && parsed.pathname.startsWith("/media/")) {
    return parsed.pathname + parsed.search;
  }
  return url;
}

/**
 * The ~400 px companion of a processed upload, or `null` when there is none.
 *
 * A photo that went through the upload pipeline (`POST /admin/media/upload/`) is
 * stored as `tenants/<slug>/image/<32 hex>.<ext>` next to a thumbnail named
 * `<32 hex>.thumb.<ext>`. Pictures that are small on screen (a 120 px menu card,
 * a 64 px cart row, a 48 px list tile) can load that instead of a file up to
 * 1920 px wide: a 30-dish category costs about 1 MB instead of 10.
 *
 * Only that exact shape qualifies (a 32-hex name under `/tenants/<slug>/image/`,
 * on any host, with or without a query). Legacy uploads and anything that is
 * already a thumbnail return `null` and the caller keeps the full image. The
 * result is a guess about a file the backend normally wrote, so a caller must
 * fall back to the full image when it fails to load (SmartImage does).
 */
const PROCESSED_UPLOAD =
  /^([^?#]*\/tenants\/[^/?#]+\/image\/[0-9a-f]{32})(\.(?:jpe?g|png|webp))([?#].*)?$/i;

export function thumbnailSrc(url: string | null | undefined): string | null {
  const src = mediaSrc(url);
  if (!src) return null;
  const match = PROCESSED_UPLOAD.exec(src);
  return match ? `${match[1]}.thumb${match[2]}${match[3] ?? ""}` : null;
}

/**
 * Make a stored image URL absolute for places that require it (JSON-LD, Open
 * Graph). Relative `/media/…` paths are resolved against the public site origin;
 * anything already absolute is returned as is.
 */
export function absoluteMediaUrl(
  origin: string,
  url: string | null | undefined,
): string | null {
  const src = mediaSrc(url);
  if (!src) return null;
  if (src.startsWith("/") && !src.startsWith("//")) {
    return `${origin.replace(/\/+$/, "")}${src}`;
  }
  return src;
}
