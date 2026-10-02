/**
 * Server-to-server identification for calls from this Next.js server to the
 * Django API (ANALYSIS_1 F-05).
 *
 * Every public page is rendered on the server, so all of those backend calls
 * come from this one process. Without help, Django's per-IP anonymous
 * throttle counted every visitor of every business as a single client and
 * the 61st page view in a minute was an error page. The shared secret below
 * lets Django recognise this trusted caller and skip the read-endpoint
 * throttles (see backend `apps/core/throttling.py`). Browsers and the write
 * endpoints stay limited per client.
 *
 * `INTERNAL_API_TOKEN` is deliberately NOT `NEXT_PUBLIC_*`: it must exist
 * only in server environments. Call this only from server-side code paths
 * (`internal: true`); in a browser bundle `process.env.INTERNAL_API_TOKEN`
 * is `undefined` and the helper returns no headers.
 */
export function internalApiHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_API_TOKEN;
  return token ? { "X-Internal-Token": token } : {};
}
