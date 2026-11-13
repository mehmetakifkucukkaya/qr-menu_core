/**
 * Parse one `Set-Cookie` header value.
 *
 * The admin login is a Next.js server action: it calls Django, then has to
 * hand Django's cookies to the browser itself. It used to copy only name and
 * value, which silently dropped HttpOnly, Secure, SameSite and Max-Age - the
 * session cookie became readable by scripts, travelled over http and, with no
 * Max-Age, died with the browser window (a kitchen tablet signed out every
 * time the browser restarted; ANALYSIS_1 F-35). This keeps the attributes.
 *
 * `Domain` is deliberately dropped: Django's value names the API host, and the
 * cookie must belong to the host the browser is talking to.
 */

export interface CookieOptions {
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
  expires?: Date;
}

export interface ParsedSetCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export function parseSetCookie(header: string): ParsedSetCookie | null {
  const [pair, ...attributes] = header.split(";");
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

  const options: CookieOptions = { path: "/" };
  for (const raw of attributes) {
    const idx = raw.indexOf("=");
    const key = (idx === -1 ? raw : raw.slice(0, idx)).trim().toLowerCase();
    const attr = idx === -1 ? "" : raw.slice(idx + 1).trim();
    switch (key) {
      case "path":
        if (attr) options.path = attr;
        break;
      case "max-age": {
        const seconds = Number.parseInt(attr, 10);
        if (Number.isFinite(seconds)) options.maxAge = seconds;
        break;
      }
      case "expires": {
        const when = new Date(attr);
        if (!Number.isNaN(when.getTime())) options.expires = when;
        break;
      }
      case "httponly":
        options.httpOnly = true;
        break;
      case "secure":
        options.secure = true;
        break;
      case "samesite": {
        const mode = attr.toLowerCase();
        if (mode === "lax" || mode === "strict" || mode === "none") options.sameSite = mode;
        break;
      }
      default:
        break;
    }
  }
  return { name, value, options };
}
