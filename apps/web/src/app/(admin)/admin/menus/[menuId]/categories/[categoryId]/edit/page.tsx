import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { CategoryForm } from "../../CategoryForm";
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
  params: { menuId: string; categoryId: string };
}

/**
 * /admin/menus/{menuId}/categories/{categoryId}/edit — edit a category.
 *
 * Loads the full category list (parent dropdown needs all options),
 * then renders CategoryForm in edit mode.
 */
export default async function EditCategoryPage({ params }: PageProps) {
  const menuId = Number.parseInt(params.menuId, 10);
  const categoryId = Number.parseInt(params.categoryId, 10);
  if (!Number.isFinite(menuId) || !Number.isFinite(categoryId)) notFound();

  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect(
        "/login?next=/admin/menus/" + params.menuId + "/categories/" + params.categoryId + "/edit",
      );
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

  let parents: Awaited<ReturnType<typeof fetchCategories>> = [];
  let category;
  let catError: string | null = null;
  if (menu) {
    try {
      parents = await fetchCategories(menu.id, { internal: true, cookieHeader });
      category = parents.find((c) => c.id === categoryId);
      if (!category) {
        catError = "Kategori bulunamadı.";
      }
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href={`/admin/menus/${menu.id}/categories`}
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Kategoriler
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {menu.name} · kategori düzenle
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">
          {category?.name ?? "Kategori"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Kategori bilgilerini güncelleyin. Çevirileri TR/EN sekmelerinden
          düzenleyebilirsiniz.
        </p>
      </header>

      {catError || !category ? (
        <AdminErrorState
          title="Kategori yüklenemedi"
          message={catError ?? "Bilinmeyen hata."}
          code="admin.category.load_failed"
        />
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <CategoryForm
            menu={menu}
            category={category}
            parentOptions={parents}
            csrfToken={csrfToken}
          />
        </div>
      )}
    </div>
  );
}
