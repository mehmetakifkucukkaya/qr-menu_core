import Link from "next/link";
import { cookies } from "next/headers";
import { UtensilsCrossed, Plus, Globe, MapPin } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import { fetchMenus, AdminApiError } from "@/lib/api-admin";
import type { AdminMenu } from "@/types/admin";

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
 * /admin/menus — list every menu the current user can access.
 *
 * Each row links into the menu detail page where the operator manages
 * categories and items. The "Yeni menü" CTA opens the create form.
 */
export default async function MenusListPage() {
  const cookieHeader = readCookieHeader();
  let menus: AdminMenu[] = [];
  let loadError: string | null = null;

  try {
    menus = await fetchMenus({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
      menus = [];
    } else {
      throw err;
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Katalog
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">Menüler</h1>
          <p className="mt-1 text-sm text-muted">
            İşletmenize ait tüm menüleri buradan yönetebilirsiniz. Bir menü
            açıp kategori ve ürün ekleyebilir, çevirileri düzenleyebilirsiniz.
          </p>
        </div>
        <Link
          href="/admin/menus/new"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Yeni menü
        </Link>
      </header>

      {loadError ? (
        <AdminErrorState
          title="Menüler yüklenemedi"
          message={loadError}
          code="admin.menus.list_failed"
        />
      ) : menus.length === 0 ? (
        <AdminEmptyState
          icon={<UtensilsCrossed className="h-8 w-8" aria-hidden />}
          title="Henüz menünüz yok"
          message="İlk menünüzü oluşturun, ardından kategori ve ürün eklemeye başlayın."
          action={
            <Link
              href="/admin/menus/new"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              İlk menüyü oluştur
            </Link>
          }
        />
      ) : (
        <ul
          aria-label="Menü listesi"
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          {menus.map((menu) => (
            <li key={menu.id}>
              <Link
                href={`/admin/menus/${menu.id}`}
                className="group flex h-full flex-col gap-2 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-heading text-lg font-semibold text-text">
                      {menu.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      /{menu.slug}
                    </p>
                  </div>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                      (menu.is_active
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/20 text-muted")
                    }
                  >
                    {menu.is_active ? "Yayında" : "Pasif"}
                  </span>
                </div>
                {menu.description ? (
                  <p className="line-clamp-2 text-sm text-muted">
                    {menu.description}
                  </p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Globe className="h-3 w-3" aria-hidden />
                    {menu.supported_locales.join(" / ").toUpperCase()}
                  </span>
                  {menu.branch ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {menu.branch.name}
                    </span>
                  ) : null}
                  <span>
                    {new Date(menu.updated_at).toLocaleDateString("tr-TR")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
