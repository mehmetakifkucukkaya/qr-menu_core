import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { ItemForm } from "../../ItemForm";
import {
  fetchAllergens,
  fetchCategories,
  fetchCurrentUser,
  fetchDietaryTags,
  fetchItems,
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
  params: { menuId: string; categoryId: string; itemId: string };
}

/**
 * /admin/menus/{menuId}/categories/{categoryId}/items/{itemId}/edit —
 * edit an existing item.
 */
export default async function EditItemPage({ params }: PageProps) {
  const menuId = Number.parseInt(params.menuId, 10);
  const categoryId = Number.parseInt(params.categoryId, 10);
  const itemId = Number.parseInt(params.itemId, 10);
  if (
    !Number.isFinite(menuId) ||
    !Number.isFinite(categoryId) ||
    !Number.isFinite(itemId)
  ) {
    notFound();
  }

  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/menus/" + params.menuId + "/categories/" + params.categoryId + "/items/" + params.itemId + "/edit");
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
          code="admin.menus.detail_failed"
        />
      </div>
    );
  }

  const [categories, items, allergens, dietaryTags] = await Promise.all([
    fetchCategories(menu.id, { internal: true, cookieHeader }).catch(() => []),
    fetchItems(categoryId, { internal: true, cookieHeader }).catch(() => []),
    fetchAllergens({ internal: true, cookieHeader }).catch(() => []),
    fetchDietaryTags({ internal: true, cookieHeader }).catch(() => []),
  ]);
  const category = categories.find((c) => c.id === categoryId);
  const item = items.find((i) => i.id === itemId);
  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href={`/admin/menus/${menu.id}/categories/${categoryId}/items`}
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Ürünler
        </Link>
      </nav>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {menu.name} · {category?.name ?? "Kategori"} · ürün düzenle
        </p>
        <h1 className="font-heading text-2xl font-bold text-text">
          {item?.name ?? "Ürün"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Tüm alanları düzenleyebilirsiniz. Fiyat ve stok durumu için
          ayrıca tablodaki hızlı işlemleri kullanabilirsiniz.
        </p>
      </header>

      {category && item ? (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <ItemForm
            menu={menu}
            category={category}
            item={item}
            allergens={allergens}
            dietaryTags={dietaryTags}
            csrfToken={csrfToken}
            onSaved={() => {
              redirect(`/admin/menus/${menu.id}/categories/${category.id}/items`);
            }}
          />
        </div>
      ) : (
        <AdminErrorState
          title="Ürün yüklenemedi"
          message={
            !category
              ? "Kategori bulunamadı."
              : "Ürün bulunamadı."
          }
        />
      )}
    </div>
  );
}
