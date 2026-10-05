import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminApiError, fetchCurrentUser } from "@/lib/api-admin";
import { landingPathFor, uiRole } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /admin - the front door. Sends each role to its own landing page (owner and
 * manager: dashboard, staff: orders, kitchen: the kitchen board). Before this
 * existed `/admin` was a 404, which the breadcrumb's first crumb linked to.
 */
export default async function AdminIndexPage() {
  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let target = "/login?next=/admin";
  try {
    const user = await fetchCurrentUser({ internal: true, cookieHeader });
    const role = uiRole(user.membership_role, user.is_superuser || user.role === "admin");
    target = role === null ? "/login" : landingPathFor(role);
  } catch (err) {
    // Only a missing/stale session sends people to the login page; anything
    // else is a real failure for the error boundary.
    if (!(err instanceof AdminApiError && (err.status === 401 || err.status === 403))) {
      throw err;
    }
  }
  // redirect() works by throwing: keep it outside the try/catch above.
  redirect(target);
}
