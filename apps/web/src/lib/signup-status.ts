/**
 * Is public self-service signup open? Asked of the backend, which owns the
 * `SIGNUP_ENABLED` switch, so the front end never has a second copy of it.
 *
 * `check-slug` is the cheapest public signup endpoint: it answers 404
 * `signup.disabled` while signup is closed. Server-side only.
 */

import { internalApiHeaders } from "./internal-api";

export type SignupStatus = "open" | "closed" | "unknown";

export async function fetchSignupStatus(): Promise<SignupStatus> {
  const base =
    process.env.INTERNAL_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://backend:8000";
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/auth/check-slug?slug=ab`, {
      cache: "no-store",
      headers: { Accept: "application/json", ...internalApiHeaders() },
    });
    if (res.status === 404) return "closed";
    return res.ok ? "open" : "unknown";
  } catch {
    // Backend unreachable: let the wizard render and surface the real error.
    return "unknown";
  }
}
