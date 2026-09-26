import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, FolderTree, Plus } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import { CategoriesReorder } from "./CategoriesReorder";
import {
  fetchCategories,
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
 * /admin/menus/{menuId}/categories — full categories management.
 *
 * Each row has up/down reorder buttons (CategoriesReorder handles the
 * API call + state). The page is intentionally a thin shell so the
 * reorder logic lives in a focused client component.
 */
export default async function CategoriesPage({ params }: PageProps) {
  const menuId = Number.parseInt(params.menuId, 10);
  if (!Number.isFinite(menuId)) notFound();

  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/menus/" + params.menuId + "/categories");
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

  let categories: Awaited<ReturnType<typeof fetchCategories>> = [];
  let catError: string | null = null;
  if (menu) {
    try {
      categories = await fetchCategories(menu.id, {
        internal: true,
        cookieHeader,
      });
    } catch (err) {
      if (err instanceof AdminApiError) {
        catError = err.message;
      } else {
        throw err;
      }
    }
  }

  if (menuError || !menu) {
    return (
      <div className="mx-auto max-w-3xl">
        <AdminErrorState
          title="Menü yüklenemedi"
          message={menuError ?? "Bilinmeyen hata."}
          code="admin.menus.detail_failed"
        />
      </div>
    );
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href={`/admin/menus/${menu.id}`}
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {menu.name}
        </Link>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Katalog · {menu.name}
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            Kategoriler
          </h1>
          <p className="mt-1 text-sm text-muted">
            Yukarı / aşağı okları ile sıralama değiştirilebilir. Değişiklikler
            müşteri sayfasına anında yansır.
          </p>
        </div>
        <Link
          href={`/admin/menus/${menu.id}/categories/new`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          <Plus className="h-4 w-4" />
          Yeni kategori
        </Link>
      </header>

      {catError ? (
        <AdminErrorState
          title="Kategoriler yüklenemedi"
          message={catError}
          code="admin.categories.list_failed"
        />
      ) : categories.length === 0 ? (
        <AdminEmptyState
          icon={<FolderTree className="h-8 w-8" aria-hidden />}
          title="Henüz kategori yok"
          message="İlk kategoriyi ekleyerek ürünleri gruplamaya başlayın."
          action={
            <Link
              href={`/admin/menus/${menu.id}/categories/new`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              İlk kategoriyi oluştur
            </Link>
          }
        />
      ) : (
        <CategoriesReorder
          menuId={menu.id}
          initialCategories={categories}
          csrfToken={csrfToken}
        />
      )}

      <p className="text-center text-xs text-muted">
        Toplam {categories.length} kategori.{" "}
        <Link
          href={`/admin/menus/${menu.id}`}
          className="text-primary hover:underline"
        >
          Menüye dön →
        </Link>
      </p>
    </div>
  );
}
