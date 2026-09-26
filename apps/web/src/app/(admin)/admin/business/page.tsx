import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { BusinessForm } from "./BusinessForm";
import {
  fetchCurrentOrganization,
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

/**
 * /admin/business — organization settings.
 *
 * Lets the operator edit contact info (phone, whatsapp, instagram,
 * address, google maps), branding (logo, cover), locale + currency
 * defaults. PATCHes the current organization. Logo/cover upload is a
 * V1 limitation (D-011): the file is captured client-side but the
 * multipart backend route lands in Sprint 5.
 */
export default async function BusinessSettingsPage() {
  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/business");
    }
    throw err;
  }

  let organization;
  let orgError: string | null = null;
  try {
    organization = await fetchCurrentOrganization({
      internal: true,
      cookieHeader,
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      orgError = err.message;
    } else {
      throw err;
    }
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-end gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Ayarlar
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            İşletme bilgileri
          </h1>
          <p className="mt-1 text-sm text-muted">
            Müşterilerin göreceği iletişim ve adres bilgileri.
            Değişiklikler anında yayına yansır.
          </p>
        </div>
      </header>

      {orgError || !organization ? (
        <AdminErrorState
          title="İşletme bilgisi alınamadı"
          message={orgError ?? "Bilinmeyen hata."}
          code="organization.fetch_failed"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <BusinessForm organization={organization} csrfToken={csrfToken} />
        </div>
      )}
    </div>
  );
}
