import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  fetchCurrentUser,
  fetchCustomerDetail,
  AdminApiError,
} from "@/lib/api-admin";
import { CustomerDetailHeader } from "../CustomerDetailHeader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_NEXT = "/admin/customers";

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

interface PageProps {
  params: { customerId: string };
}

function resolveId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * /admin/customers/{id} — full customer detail (Sprint 10C).
 *
 * 404 fallback:
 *   - customer id is non-numeric
 *   - backend returns 404 (either unknown id, or cross-tenant access
 *     where the customer has no Order / LoyaltyTransaction history at
 *     the operator's org — D-025 tenant isolation)
 */
export default async function CustomerDetailPage({ params }: PageProps) {
  const cookieHeader = readCookieHeader();
  const id = resolveId(params.customerId);
  if (id === null) notFound();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=" + DEFAULT_NEXT);
    }
    throw err;
  }

  let detail;
  try {
    detail = await fetchCustomerDetail(id, { internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && err.status === 404) notFound();
    throw err;
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  // Derive the 1-entry per-org breakdown from the flat balance — V1
  // admin is single-org, but the spec asks for the array shape so the
  // V2 multi-tenant upgrade can fill it without a UI change.
  // We surface the org name from the customer's most recent order if
  // available, otherwise fall back to a generic label.
  const fallbackOrgName =
    detail.loyalty.recent_orders.length > 0
      ? // recent_orders doesn't carry org name either (10C spec drift),
        // so we just print "Bu işletme" until the backend exposes it.
        "Bu işletme"
      : "Bu işletme";

  const detailWithBalanceByOrg = {
    ...detail,
    loyalty: {
      ...detail.loyalty,
      balance_by_org: [
        {
          organization_id: -1, // unknown — surfaced as a fallback row
          organization_name: fallbackOrgName,
          balance: detail.loyalty.loyalty_balance,
        },
      ],
    },
  };

  return (
    <CustomerDetailHeader
      detail={detailWithBalanceByOrg}
      csrfToken={csrfToken}
    />
  );
}
