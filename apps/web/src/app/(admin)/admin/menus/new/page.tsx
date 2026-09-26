import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { MenuForm } from "../MenuForm";
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

const CSRF_COOKIE = "qr_csrftoken";

/**
 * /admin/menus/new — create a new menu.
 *
 * Auth + organization are pulled in the server component so the form
 * starts with everything it needs (csrf token + organization_id). After
 * a successful save we route into the new menu's detail page.
 */
export default async function NewMenuPage() {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get(CSRF_COOKIE)?.value ?? null;

  // Defence-in-depth — layout already validated the session, but the
  // session could have expired between layout and page render.
  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/menus/new");
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href="/admin/menus"
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Menüler
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Yeni menü
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">
          Menü oluştur
        </h1>
        <p className="mt-1 text-sm text-muted">
          Adı, dili ve yayın durumunu belirleyin. Sonraki adımda kategori
          ekleyeceksiniz.
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
          <MenuForm
            organization={organization}
            csrfToken={csrfToken}
            onSaved={(menu) => {
              // Server-rendered redirect: we navigate the client to the
              // detail page so the operator can start adding categories.
              redirect(`/admin/menus/${menu.id}`);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
