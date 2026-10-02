import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { QrForm } from "@/app/(admin)/_components/QrForm";
import {
  fetchQRCode,
  fetchCurrentOrganization,
  fetchCurrentUser,
  fetchMenus,
  AdminApiError,
} from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

interface PageProps {
  params: { qrId: string };
}

/**
 * /admin/qr-codes/{qrId}/edit — partial update of a QR code.
 *
 * The backend only exposes `label`, `table_number`, and `is_active` for
 * PATCH (target_url, scan_count, FKs are read-only — see
 * `UpdateQRPayload`). QrForm switches to edit mode and hides the menu /
 * branch selectors so the operator can't accidentally change a bound
 * that's already encoded into a printed QR.
 */
export default async function EditQRCodePage({ params }: PageProps) {
  const qrId = Number.parseInt(params.qrId, 10);
  if (!Number.isFinite(qrId)) notFound();

  const cookieHeader = readCookieHeader();

  // Defence-in-depth auth guard.
  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/qr-codes/" + params.qrId + "/edit");
    }
    throw err;
  }

  let qr;
  let loadError: string | null = null;
  try {
    qr = await fetchQRCode(qrId, { internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      if (err.status === 404) notFound();
      loadError = err.message;
    } else {
      throw err;
    }
  }

  if (loadError || !qr) {
    return (
      <div className="mx-auto max-w-3xl">
        <AdminErrorState
          title="QR kod yüklenemedi"
          message={loadError ?? "Bilinmeyen hata."}
          code="admin.qr_codes.edit_load_failed"
        />
      </div>
    );
  }

  const [organization, csrfToken] = await Promise.all([
    fetchCurrentOrganization({ internal: true, cookieHeader }).catch(() => null),
    Promise.resolve(cookies().get("qr_csrftoken")?.value ?? null),
  ]);

  // QrForm in edit mode ignores menus / branches, but its TypeScript
  // surface still needs the props passed (typed as required arrays).
  // Empty arrays are safe — they're never read in edit mode.
  const menus = await fetchMenus({ internal: true, cookieHeader }).catch(() => []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href={`/admin/qr-codes/${qr.id}`}
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {qr.label || `QR #${qr.id}`}
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          QR kodu düzenle
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">
          {qr.label || `QR #${qr.id}`}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Etiket ve durum alanlarını güncelleyin. Hedef menü / şube QR kod
          yazdırıldıktan sonra değiştirilemez; bunlar için yeni bir QR
          oluşturun.
        </p>
      </header>

      {organization ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <QrForm
            qr={qr}
            organization={organization}
            menus={menus}
            branches={[]}
            csrfToken={csrfToken}
          />
        </div>
      ) : (
        <AdminErrorState
          title="İşletme bilgisi alınamadı"
          message="Form yüklenemedi."
        />
      )}
    </div>
  );
}
