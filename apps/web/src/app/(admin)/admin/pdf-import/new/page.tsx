import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { fetchCurrentOrganization, fetchCurrentUser, AdminApiError } from "@/lib/api-admin";
import { PdfImportNewClient } from "./PdfImportNewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

const CSRF_COOKIE = "qr_csrftoken";

/**
 * `/admin/pdf-import/new` — server wrapper for the client upload flow.
 *
 * Responsibilities:
 *   1. Defence-in-depth auth check via `/api/v1/me` (the middleware
 *      already redirects on missing cookies, but a stale cookie could
 *      still slip through).
 *   2. Verify the user belongs to at least one organization — without
 *      it the backend would reject the upload with
 *      `pdf.no_organization` (403). Surface that early.
 *   3. Pull the CSRF cookie and forward it to the client island.
 *
 * The actual dropzone + progress UI lives in `PdfImportNewClient.tsx`
 * (must be a client component for `FormData` + drag events).
 */
export default async function NewPdfImportPage() {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get(CSRF_COOKIE)?.value ?? null;

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/pdf-import/new");
    }
    throw err;
  }

  let orgError: string | null = null;
  try {
    await fetchCurrentOrganization({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      orgError = err.message;
    } else {
      throw err;
    }
  }

  if (orgError) {
    return (
      <div className="mx-auto max-w-3xl">
        <AdminErrorState
          title="İşletme bilgisi alınamadı"
          message="PDF import için bir işletmeye üye olmalısınız."
          code="organization.fetch_failed"
        />
      </div>
    );
  }

  return <PdfImportNewClient csrfToken={csrfToken} />;
}