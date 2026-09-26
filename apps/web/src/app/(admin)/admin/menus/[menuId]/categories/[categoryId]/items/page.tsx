import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Package } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import { ItemsListClient } from "./ItemsListClient";
import {
  fetchCategories,
  fetchCurrentUser,
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
  params: { menuId: string; categoryId: string };
}

/**
 * /admin/menus/{menuId}/categories/{categoryId}/items — items table for
 * a single category, with inline price edit + active/available toggles.
 *
 * Most of the interaction lives in ItemsListClient. This server
 * component is responsible for auth + initial data load.
 */
export default async function ItemsListPage({ params }: PageProps) {
  const menuId = Number.parseInt(params.menuId, 10);
  const categoryId = Number.parseInt(params.categoryId, 10);
  if (!Number.isFinite(menuId) || !Number.isFinite(categoryId)) notFound();

  const cookieHeader = readCookieHeader();

  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect(
        "/login?next=/admin/menus/" + params.menuId + "/categories/" + params.categoryId + "/items",
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

  let category;
  let categoryError: string | null = null;
  let items: Awaited<ReturnType<typeof fetchItems>> = [];
  let itemsError: string | null = null;
  if (menu) {
    try {
      const cats = await fetchCategories(menu.id, {
        internal: true,
        cookieHeader,
      });
      category = cats.find((c) => c.id === categoryId);
      if (!category) {
        categoryError = "Kategori bulunamadı.";
      } else {
        try {
          items = await fetchItems(category.id, {
            internal: true,
            cookieHeader,
          });
        } catch (err) {
          if (err instanceof AdminApiError) {
            itemsError = err.message;
          } else {
            throw err;
          }
        }
      }
    } catch (err) {
      if (err instanceof AdminApiError) {
        categoryError = err.message;
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
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <nav aria-label="Geri" className="flex items-center gap-1 text-sm">
        <Link
          href={`/admin/menus/${menu.id}`}
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {menu.name}
        </Link>
        <ChevronRight className="h-3 w-3 text-muted/60" />
        <Link
          href={`/admin/menus/${menu.id}/categories`}
          className="text-muted transition hover:text-primary"
        >
          Kategoriler
        </Link>
        {category ? (
          <>
            <ChevronRight className="h-3 w-3 text-muted/60" />
            <span className="font-medium text-text">{category.name}</span>
          </>
        ) : null}
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {menu.name}
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            {category?.name ?? "Ürünler"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Fiyat ve stok durumunu tablodan hızlıca güncelleyebilirsiniz.
            Değişiklikler müşteri sayfasına anında yansır.
          </p>
        </div>
        {category ? (
          <Link
            href={`/admin/menus/${menu.id}/categories/${category.id}/items/new`}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <Package className="h-4 w-4" />
            Yeni ürün
          </Link>
        ) : null}
      </header>

      {categoryError || !category ? (
        <AdminErrorState
          title="Kategori yüklenemedi"
          message={categoryError ?? "Bilinmeyen hata."}
          code="admin.category.load_failed"
        />
      ) : itemsError ? (
        <AdminErrorState
          title="Ürünler yüklenemedi"
          message={itemsError}
          code="admin.items.list_failed"
        />
      ) : items.length === 0 ? (
        <AdminEmptyState
          icon={<Package className="h-8 w-8" aria-hidden />}
          title="Bu kategoride henüz ürün yok"
          message="İlk ürünü ekleyerek menüyü oluşturmaya başlayın."
          action={
            <Link
              href={`/admin/menus/${menu.id}/categories/${category.id}/items/new`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            >
              <Package className="h-4 w-4" />
              İlk ürünü ekle
            </Link>
          }
        />
      ) : (
        <ItemsListClient
          menuId={menu.id}
          categoryId={category.id}
          initialItems={items}
          csrfToken={csrfToken}
        />
      )}
    </div>
  );
}
