import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { QrForm } from "@/app/(admin)/_components/QrForm";
import {
  fetchBranches,
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

const CSRF_COOKIE = "qr_csrftoken";

/**
 * /admin/qr-codes/new — create a new QR code.
 *
 * Server component responsibilities:
 *   1. Auth + organization lookup.
 *   2. Pull the menu and branch lookup lists server-side (these power
 *      the form's `<select>`s).
 *   3. Render `QrForm` in create mode. The form handles its own submit
 *      and pushes the user to `/admin/qr-codes/{id}` on success.
 *
 * The form components accept pre-fetched lookup maps so we never issue
 * an N+1 — one GET per scope on the backend.
 */
export default async function NewQRCodePage() {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get(CSRF_COOKIE)?.value ?? null;

  // Defence-in-depth auth check.
  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/qr-codes/new");
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

  // Lookups (best-effort: page should still render if they fail).
  let menus: Awaited<ReturnType<typeof fetchMenus>> = [];
  let branches: Awaited<ReturnType<typeof fetchBranches>> = [];
  if (organization) {
    try {
      [menus, branches] = await Promise.all([
        fetchMenus({ internal: true, cookieHeader }),
        fetchBranches({ internal: true, cookieHeader }),
      ]);
    } catch {
      // Lookups are best-effort — the form will surface individual errors.
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href="/admin/qr-codes"
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          QR Kodlar
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Yeni QR kodu
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">
          QR kodu oluştur
        </h1>
        <p className="mt-1 text-sm text-muted">
          Etiket, hedef menü ve isteğe bağlı şube bilgisini girin. Oluşturulan
          QR&apos;ın PNG&apos;sini bir sonraki sayfadan indirebilirsiniz.
        </p>
      </header>

      {orgError ? (
        <AdminErrorState
          title="İşletme bilgisi alınamadı"
          message={orgError}
          code="organization.fetch_failed"
        />
      ) : organization ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <QrForm
            organization={organization}
            menus={menus}
            branches={branches}
            csrfToken={csrfToken}
          />
        </div>
      ) : null}
    </div>
  );
}
