"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";

import { TranslationGapPanel } from "@/app/(admin)/_components/TranslationGapPanel";
import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";
import {
  fetchCategories,
  fetchMenu,
  fetchTranslateStats,
  AdminApiError,
} from "@/lib/api-admin";
import type {
  AdminMenu,
  AITranslateStatsResponse,
} from "@/types/admin";

interface PageProps {
  params: { menuId: string };
}

/**
 * /admin/menus/{menuId}/translate — bulk AI translation workspace.
 *
 * Sprint 9B: dedicated route that surfaces the TranslationGapPanel +
 * opens the BulkTranslateModal automatically. Mirrors the in-page modal
 * flow on the menu overview but lives at its own URL so operators can
 * bookmark the workspace.
 *
 * Why a client component? The page is essentially a thin wrapper around
 * the gap panel + modal which already need browser-only state (CSRF,
 * fetch). Pulling the data from the server and rendering the modal
 * client-side keeps the page bundle identical to the menu overview and
 * avoids duplicating the same data-loading logic.
 */
export default function MenuTranslatePage({ params }: PageProps) {
  const router = useRouter();
  const menuId = Number.parseInt(params.menuId, 10);
  const [menu, setMenu] = useState<AdminMenu | null>(null);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [stats, setStats] = useState<AITranslateStatsResponse | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Number.isFinite(menuId)) {
      router.replace("/admin/menus");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [menuResp, categoriesResp, statsResp] = await Promise.all([
          fetchMenu(menuId),
          fetchCategories(menuId),
          fetchTranslateStats().catch(() => null),
        ]);
        if (cancelled) return;
        setMenu(menuResp);
        setCategoryIds(categoriesResp.map((c) => c.id));
        setStats(
          statsResp ?? {
            translation_memory: {
              total: 0,
              per_target_locale: {},
              per_provider: {},
            },
            descriptions: { total: 0, edited: 0 },
            supported_locales: menuResp.supported_locales,
          },
        );
        // CSRF: read the cookie at render time. The cookie is set by the
        // browser via the SessionAuthentication middleware.
        const match = document.cookie.match(/qr_csrftoken=([^;]+)/);
        setCsrfToken(match ? decodeURIComponent(match[1]) : null);
      } catch (err) {
        if (err instanceof AdminApiError) {
          if (err.status === 404) {
            router.replace("/admin/menus");
            return;
          }
          if (err.status === 401 || err.status === 403) {
            router.replace("/login?next=/admin/menus/" + params.menuId + "/translate");
            return;
          }
          setError(err.message);
        } else {
          setError("Sayfa yüklenemedi.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [menuId, params.menuId, router]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted">Yükleniyor…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <AdminErrorState
          title="Çeviri çalışma alanı yüklenemedi"
          message={error}
          code="admin.translate.page_failed"
        />
      </div>
    );
  }

  if (!menu) return null;

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

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Çeviri çalışma alanı
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-text">
          AI ile toplu çeviri
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          {menu.name} menüsü — desteklenen diller:{" "}
          {menu.supported_locales.map((l) => l.toUpperCase()).join(" / ")}
        </p>
      </header>

      {stats ? (
        <TranslationGapPanel
          menu={menu}
          stats={stats}
          csrfToken={csrfToken}
          categoryIds={categoryIds}
        />
      ) : null}

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        Toplu çeviri, menüdeki tüm ürünleri seçtiğiniz hedef dillere çevirir.
        Önbelleğe alınmış metinler tekrar ücretlendirilmez — sadece yeni
        içerik API call üretir.
      </p>
    </div>
  );
}