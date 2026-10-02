import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { MenuForm } from "../../MenuForm";
import {
  fetchCurrentOrganization,
  fetchCurrentUser,
  fetchMenu,
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
  params: { menuId: string };
}

/**
 * /admin/menus/{menuId}/edit — edit an existing menu.
 *
 * Reuses MenuForm in edit mode; on save we redirect back to the detail
 * page so the operator can immediately jump into category management.
 */
export default async function EditMenuPage({ params }: PageProps) {
  const menuId = Number.parseInt(params.menuId, 10);
  if (!Number.isFinite(menuId)) notFound();

  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/menus/" + params.menuId + "/edit");
    }
    throw err;
  }

  let menu;
  let menuError: string | null = null;
  try {
    menu = await fetchMenu(menuId, { internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      if (err.status === 404) notFound();
      menuError = err.message;
    } else {
      throw err;
    }
  }

  if (menuError || !menu) {
    return (
      <div className="mx-auto max-w-3xl">
        <AdminErrorState
          title="Menü yüklenemedi"
          message={menuError ?? "Bilinmeyen hata."}
          code="admin.menus.edit_load_failed"
        />
      </div>
    );
  }

  const [organization, csrfToken] = await Promise.all([
    fetchCurrentOrganization({ internal: true, cookieHeader }).catch(() => null),
    Promise.resolve(cookies().get("qr_csrftoken")?.value ?? null),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href={`/admin/menus/${menu.id}`}
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {menu.name}
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Menü düzenle
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">{menu.name}</h1>
        <p className="mt-1 text-sm text-muted">
          Menü bilgilerini güncelleyin. Değişiklikler kaydedildiğinde
          müşterilerin erişimine anında yansır.
        </p>
      </header>

      {organization ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <MenuForm
            menu={menu}
            organization={organization}
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
