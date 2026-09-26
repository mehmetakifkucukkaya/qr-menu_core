import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import {
  AdminApiError,
  fetchCurrentUser,
  fetchImportDraft,
} from "@/lib/api-admin";

import { PdfDraftDetailClient } from "./PdfDraftDetailClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

const CSRF_COOKIE = "qr_csrftoken";

interface PageProps {
  params: { draftId: string };
}

/**
 * /admin/pdf-import/drafts/{draftId} — operator detail view for one
 * import draft.
 *
 * Server component responsibilities:
 *   1. Auth guard via `/api/v1/me` (defence-in-depth on top of the
 *      middleware redirect).
 *   2. Fetch the full draft + items via `/api/v1/admin/pdf-import/drafts/{id}/`.
 *   3. Hand the snapshot to `PdfDraftDetailClient` which owns the
 *      editable table, confirm modal and discard flow.
 *
 * The page is read-only here — every interactive surface is a client
 * island colocated with the parent directory.
 */
export default async function PdfImportDraftDetailPage({ params }: PageProps) {
  const draftId = Number.parseInt(params.draftId, 10);
  if (!Number.isFinite(draftId)) notFound();

  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get(CSRF_COOKIE)?.value ?? null;

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect(`/login?next=/admin/pdf-import/drafts/${draftId}`);
    }
    throw err;
  }

  let draft;
  let loadError: string | null = null;
  try {
    draft = await fetchImportDraft(draftId, { internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      if (err.status === 404) notFound();
      loadError = err.message;
    } else {
      throw err;
    }
  }

  if (loadError || !draft) {
    return (
      <div className="mx-auto max-w-3xl">
        <AdminErrorState
          title="Import draft yüklenemedi"
          message={loadError ?? "Bilinmeyen hata."}
          code="admin.pdf_import.detail_failed"
        />
      </div>
    );
  }

  return <PdfDraftDetailClient initialDraft={draft} csrfToken={csrfToken} />;
}