import { cookies } from "next/headers";
import { PackageCheck } from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import {
  AdminApiError,
  fetchAllMenuItems,
  fetchCategories,
  fetchMenus,
} from "@/lib/api-admin";
import { AvailabilityClient, type AvailabilityGroup } from "./AvailabilityClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/availability - "tükendi / mevcut" for every dish on one page.
 *
 * It exists for floor staff: they may not edit the menu, but when the kitchen
 * runs out of something somebody has to take it off the customers' menu
 * within seconds. Owner and manager use it for the same quick toggle.
 */
export default async function AvailabilityPage() {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;
  const options = { internal: true, cookieHeader } as const;

  let error: string | null = null;
  let groups: AvailabilityGroup[] = [];
  try {
    const [items, menus] = await Promise.all([fetchAllMenuItems(options), fetchMenus(options)]);
    const categoryLists = await Promise.all(menus.map((menu) => fetchCategories(menu.id, options)));
    const categoryName = new Map<number, string>();
    categoryLists.flat().forEach((category) => categoryName.set(category.id, category.name));

    const byCategory = new Map<number, AvailabilityGroup>();
    for (const item of items) {
      if (!item.is_active) continue; // taken off the menu on purpose: not this page's business
      const group = byCategory.get(item.category_id) ?? {
        categoryId: item.category_id,
        categoryName: categoryName.get(item.category_id) ?? "Kategorisiz",
        items: [],
      };
      group.items.push({
        id: item.id,
        name: item.name,
        price: item.price,
        currency: item.currency,
        isAvailable: item.is_available,
      });
      byCategory.set(item.category_id, group);
    }
    groups = [...byCategory.values()];
  } catch (err) {
    if (err instanceof AdminApiError) {
      error = err.message;
    } else {
      throw err;
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex items-end gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <PackageCheck className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Katalog</p>
          <h1 className="font-heading text-2xl font-bold text-text">Ürün durumu</h1>
          <p className="mt-1 text-sm text-muted">
            Biten ürünü “Tükendi” yapın; müşterilerin menüsünde anında kapanır. Geri geldiğinde “Mevcut” yapın.
          </p>
        </div>
      </header>

      {error ? (
        <AdminErrorState title="Ürünler alınamadı" message={error} code="availability.fetch_failed" />
      ) : (
        <AvailabilityClient groups={groups} csrfToken={csrfToken} />
      )}
    </div>
  );
}
