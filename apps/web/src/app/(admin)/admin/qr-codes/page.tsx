import Link from "next/link";
import { cookies } from "next/headers";
import { Plus, QrCode } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import { QrListItem } from "@/app/(admin)/_components/QrListItem";
import {
  fetchQRCodes,
  AdminApiError,
} from "@/lib/api-admin";
import type { AdminQRCode } from "@/types/admin";

// Admin list pages depend on cookies + the request user; opt out of static
// prerender so Next.js doesn't try to bake them at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/qr-codes — list every QR code the current tenant owns.
 *
 * Server component responsibilities:
 *   1. Fetch the QR codes via `fetchQRCodes` (tenant-scoped on the
 *      backend — no `?organization_id` filter needed client-side).
 *   2. Render a small table with label, menu, branch, table, scan count,
 *      active badge, and per-row actions (detail / delete).
 *   3. Empty-state CTA + "Yeni QR Kod" header action link to the create
 *      page.
 *
 * The QR detail page (`/[qrId]`) doubles as the edit launcher — keeping
 * the list lean and consistent with the menus/categories pattern.
 */
export default async function QRCodesListPage() {
  const cookieHeader = readCookieHeader();

  let qrs: AdminQRCode[] = [];
  let loadError: string | null = null;

  try {
    qrs = await fetchQRCodes({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
      qrs = [];
    } else {
      throw err;
    }
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Pazarlama
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">QR Kodlar</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            İşletmeniz için basılabilir QR kodlar burada. Her QR, müşterileri
            doğrudan bir menü sayfasına yönlendirir ve tarama sayısını
            takip eder.
          </p>
        </div>
        <Link
          href="/admin/qr-codes/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Yeni QR Kod
        </Link>
      </header>

      {loadError ? (
        <AdminErrorState
          title="QR kodlar yüklenemedi"
          message={loadError}
          code="admin.qr_codes.list_failed"
        />
      ) : qrs.length === 0 ? (
        <AdminEmptyState
          icon={<QrCode className="h-8 w-8" aria-hidden />}
          title="Henüz QR kodunuz yok"
          message="İlk QR kodu oluşturun, masa veya şube etiketleri verin, yazdırılabilir PNG'yi indirin."
          action={
            <Link
              href="/admin/qr-codes/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              İlk QR kodu oluştur
            </Link>
          }
        />
      ) : (
        <section
          aria-label="QR kod listesi"
          className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
        >
          <table className="w-full table-auto border-collapse text-left">
            <thead className="bg-background">
              <tr className="text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2 font-medium">Etiket</th>
                <th className="px-4 py-2 font-medium">Menü</th>
                <th className="px-4 py-2 font-medium">Şube</th>
                <th className="px-4 py-2 font-medium">Masa</th>
                <th className="px-4 py-2 text-center font-medium">Tarama</th>
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 text-right font-medium">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {qrs.map((qr) => (
                <QrListItem key={qr.id} qr={qr} csrfToken={csrfToken} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        QR kodları PNG olarak indirin, yazdırın ve masalarınıza yerleştirin.
        Her tarama otomatik olarak <code className="font-mono">?qr=&lt;id&gt;</code>{" "}
        parametresi ile izlenir.
      </p>
    </div>
  );
}
