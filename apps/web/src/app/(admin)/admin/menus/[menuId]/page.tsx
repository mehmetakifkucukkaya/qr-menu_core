import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Edit3,
  FolderTree,
  Globe,
  Power,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import { TranslationGapPanel } from "@/app/(admin)/_components/TranslationGapPanel";
import { DeleteMenuButton } from "./DeleteMenuButton";
import {
  fetchCategories,
  fetchCurrentUser,
  fetchMenu,
  fetchTranslateStats,
  AdminApiError,
} from "@/lib/api-admin";
import type { AITranslateStatsResponse } from "@/types/admin";

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
 * /admin/menus/{menuId} — menu overview + categories snapshot.
 *
 * Categories are read-only here (links out to /categories for full
 * management + reorder). This page is the entry point for an operator
 * who just opened a menu — they get a quick at-a-glance plus the
 * "kategorileri yönet" CTA.
 *
 * Sprint 9B: also renders the `TranslationGapPanel` so the operator can
 * see translation coverage + bulk-generate descriptions without leaving
 * the menu overview. Endpoint failures are swallowed — the panel hides
 * itself when the stats endpoint returns nothing useful.
 */
export default async function MenuDetailPage({ params }: PageProps) {
  const menuId = Number.parseInt(params.menuId, 10);
  if (!Number.isFinite(menuId)) notFound();

  const cookieHeader = readCookieHeader();

  // Auth guard
  try {
    await fetchCurrentUser({ internal: true, cookieHeader });
  } catch (err) {
    if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
      redirect("/login?next=/admin/menus/" + params.menuId);
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

  // Stats endpoint is optional — if the user is on a tenant without any
  // AI activity yet, the backend still returns 200 with all-zero stats,
  // so this branch rarely triggers. We swallow any 5xx so the page
  // doesn't break when the translate app is unavailable.
  let aiStats: AITranslateStatsResponse | null = null;
  try {
    aiStats = await fetchTranslateStats({ internal: true, cookieHeader });
  } catch {
    aiStats = null;
  }

  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;
  const categoryIds = categories.map((c) => c.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <nav aria-label="Geri" className="text-sm">
        <Link
          href="/admin/menus"
          className="inline-flex items-center gap-1 text-muted transition hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          Menüler
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {menu.organization?.name ?? "Menü"}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-text">
            {menu.name}
          </h1>
          {menu.description ? (
            <p className="mt-2 text-sm text-muted">{menu.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" aria-hidden />
              {menu.supported_locales.join(" / ").toUpperCase()}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider " +
                (menu.is_active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/20 text-muted")
              }
            >
              <Power className="mr-1 inline h-3 w-3" aria-hidden />
              {menu.is_active ? "Yayında" : "Pasif"}
            </span>
            <span className="font-mono text-[10px]">/{menu.slug}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/menus/${menu.id}/translate`}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Sparkles className="h-4 w-4" />
            AI Çeviri
          </Link>
          <Link
            href={`/admin/menus/${menu.id}/edit`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Edit3 className="h-4 w-4" />
            Düzenle
          </Link>
          <DeleteMenuButton id={menu.id} csrfToken={csrfToken} />
        </div>
      </header>

      {aiStats ? (
        <TranslationGapPanel
          menu={menu}
          stats={aiStats}
          csrfToken={csrfToken}
          categoryIds={categoryIds}
        />
      ) : null}

      <section
        aria-label="Kategoriler"
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted" aria-hidden />
            <h2 className="font-heading text-base font-semibold text-text">
              Kategoriler
            </h2>
            <span className="rounded-full bg-muted/20 px-2 py-0.5 text-xs font-semibold text-muted">
              {categories.length}
            </span>
          </div>
          <Link
            href={`/admin/menus/${menu.id}/categories`}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary transition hover:text-primary/80"
          >
            Tümünü yönet
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {catError ? (
          <AdminErrorState
            title="Kategoriler yüklenemedi"
            message={catError}
            code="admin.categories.list_failed"
          />
        ) : categories.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-background p-4 text-center text-sm text-muted">
            Bu menüde henüz kategori yok.{" "}
            <Link
              href={`/admin/menus/${menu.id}/categories/new`}
              className="font-medium text-primary hover:underline"
            >
              İlk kategoriyi ekle
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-background">
            {categories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/menus/${menu.id}/categories/${c.id}/items`}
                  className="group flex items-center justify-between gap-3 px-3 py-2 transition hover:bg-surface focus:outline-none focus-visible:bg-surface"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">
                      {c.name}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                      /{c.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider " +
                        (c.is_active
                          ? "bg-primary/10 text-primary"
                          : "bg-muted/20 text-muted")
                      }
                    >
                      {c.is_active ? "Aktif" : "Pasif"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted/60 transition group-hover:text-primary" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        <Trash2 className="mr-1 inline h-3 w-3 align-text-bottom" />
        Menüyü silerseniz tüm kategoriler ve ürünler de silinir.
      </p>
    </div>
  );
}
