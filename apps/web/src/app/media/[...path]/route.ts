import { isImageContentType, resolveMediaUpstream } from "@/lib/media-proxy";

/**
 * GET|HEAD /media/<path> — serve uploaded photos from the Django backend.
 *
 * Uploaded files are public pictures that every menu page links to as
 * `/media/…` on the SITE's own origin. In production Caddy answers those
 * requests straight from the shared media volume (see Caddyfile), so this
 * route is never reached. Everywhere else — `next dev`, a preview, the e2e
 * harness, a tunnel — nothing served `/media`, so a photo that was uploaded
 * and saved successfully showed up as a 404 on the public menu. This proxy
 * closes that gap at runtime (it reads INTERNAL_API_BASE_URL per request, so
 * it works in the Docker image without a rebuild).
 *
 * It is an unauthenticated file proxy, so it is deliberately narrow:
 *   - GET / HEAD only (no other method is exported);
 *   - the path is validated by `resolveMediaUpstream` (no traversal, no
 *     smuggled separators, fixed backend origin);
 *   - redirects from the backend are not followed;
 *   - only `image/*` responses are passed on — anything else is a 404, so an
 *     uploaded PDF or a stray file is never exposed through here;
 *   - the upstream status/body of a failure is never echoed back.
 */

export const dynamic = "force-dynamic";

const UPSTREAM_TIMEOUT_MS = 10_000;
const PASS_THROUGH_REQUEST_HEADERS = ["if-none-match", "if-modified-since", "range"];
const PASS_THROUGH_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

function backendBase(): string {
  return (
    process.env.INTERNAL_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  );
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
  });
}

async function serve(request: Request, method: "GET" | "HEAD"): Promise<Response> {
  const upstreamUrl = resolveMediaUpstream(backendBase(), new URL(request.url).pathname);
  if (!upstreamUrl) return notFound();

  const headers = new Headers();
  for (const name of PASS_THROUGH_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return new Response("Bad gateway", {
      status: 502,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }

  const ok = upstream.status === 200 || upstream.status === 206;
  const notModified = upstream.status === 304;
  if (!ok && !notModified) return notFound();
  // A 304 carries no content-type; a 200/206 must be a picture.
  if (ok && !isImageContentType(upstream.headers.get("content-type"))) return notFound();

  const out = new Headers();
  for (const name of PASS_THROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // File names are unique per upload, but a replaced file could reuse one:
  // let browsers cache for an hour and revalidate with the ETag after that.
  out.set("cache-control", "public, max-age=3600");
  out.set("x-content-type-options", "nosniff");

  return new Response(method === "HEAD" || notModified ? null : upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export function GET(request: Request): Promise<Response> {
  return serve(request, "GET");
}

export function HEAD(request: Request): Promise<Response> {
  return serve(request, "HEAD");
}
