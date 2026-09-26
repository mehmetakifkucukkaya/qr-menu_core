import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  Edit3,
  ExternalLink,
  Eye,
  Hash,
  MapPin,
  Power,
  QrCode,
  UtensilsCrossed,
} from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { QrPreview } from "@/app/(admin)/_components/QrPreview";
import { DeleteQRButton } from "./DeleteQRButton";
import {
  fetchQRCode,
  fetchCurrentUser,
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
 * /admin/qr-codes/{qrId} — operator detail view for one QR code.
 *
 * Sections:
 *   1. Header  — label, active badge, edit + delete actions.
 *   2. Preview — large PNG (`QrPreview`) + download button.
 *   3. Metadata — menu / branch / table / scan_count / timestamps.
 *   4. Target URL — displayed in monospace so the operator can copy it
 *      into a campaign without re-decoding the QR.
 */
export default async function QRDetailPage({ params }: PageProps) {
  const qrId = Number.parseInt(params.qrId, 10);
  if (!Number.isFinite(qrId)) notFound();

  const cookieHeader = readCookieHeader();

  // Auth guard
  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/qr-codes/" + params.qrId);
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
          code="admin.qr_codes.detail_failed"
        />
      </div>
    );
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href="/admin/qr-codes"
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          QR Kodlar
        </Link>
      </nav>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {qr.organization.name}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-text">
            {qr.label || (
              <span className="italic text-muted">(etiketsiz)</span>
            )}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span
              className={
                "rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider " +
                (qr.is_active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/20 text-muted")
              }
            >
              <Power className="mr-1 inline h-3 w-3" aria-hidden />
              {qr.is_active ? "Yayında" : "Pasif"}
            </span>
            <span className="font-mono text-[10px]">#{qr.id}</span>
            <span className="font-mono text-[10px]">
              {qr.scan_count.toLocaleString("tr-TR")} tarama
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/qr-codes/${qr.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Edit3 className="h-4 w-4" />
            Düzenle
          </Link>
          <DeleteQRButton id={qr.id} csrfToken={csrfToken} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Preview column */}
        <QrPreview id={qr.id} label={qr.label || `QR #${qr.id}`} />

        {/* Metadata column */}
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="font-heading text-base font-semibold text-text">
            Detaylar
          </h2>

          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div className="flex items-start gap-3">
              <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted">Menü</dt>
                <dd className="font-medium text-text">{qr.menu.name}</dd>
                <dd className="font-mono text-[10px] uppercase tracking-wider text-muted">
                  /{qr.menu.slug}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted">Şube</dt>
                {qr.branch ? (
                  <>
                    <dd className="font-medium text-text">{qr.branch.name}</dd>
                    <dd className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      /{qr.branch.slug}
                    </dd>
                  </>
                ) : (
                  <dd className="italic text-muted">İşletme geneli</dd>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted">Masa numarası</dt>
                {qr.table_number ? (
                  <dd className="font-medium text-text">{qr.table_number}</dd>
                ) : (
                  <dd className="italic text-muted">Belirtilmemiş</dd>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted">Tarama sayısı</dt>
                <dd className="font-medium tabular-nums text-text">
                  {qr.scan_count.toLocaleString("tr-TR")}
                </dd>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <QrCode className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0">
                <dt className="text-xs text-muted">Hedef URL</dt>
                <dd>
                  <a
                    href={qr.target_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all font-mono text-xs text-primary hover:underline"
                  >
                    {qr.target_url}
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                </dd>
              </div>
            </div>
          </dl>

          <footer className="mt-2 grid grid-cols-2 gap-3 border-t border-border pt-4 text-xs text-muted">
            <div>
              <p className="font-medium text-text">Oluşturuldu</p>
              <p>{new Date(qr.created_at).toLocaleString("tr-TR")}</p>
            </div>
            <div>
              <p className="font-medium text-text">Son güncelleme</p>
              <p>{new Date(qr.updated_at).toLocaleString("tr-TR")}</p>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}
