import { cookies } from "next/headers";
import Link from "next/link";
import { ChefHat, Store, Palette, Sparkles } from "lucide-react";

import { AdminEmptyState } from "../../_components/EmptyState";

const DEFAULT_NEXT = "/admin/dashboard";

// Dashboard renders personalized content from the request cookie; opt out
// of static prerender so Next.js doesn't try to bake it at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface DashboardStats {
  menuCount: number;
  categoryCount: number;
  itemCount: number;
}

/** Read the entire Cookie header so we can forward it on outgoing fetches. */
function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/dashboard — landing page after login.
 *
 * Sprint 4A scope is intentionally minimal:
 *   - Welcome banner (greeting + tagline)
 *   - Quick links to the upcoming sections (menus, business, theme)
 *   - Empty state card with a CTA hint
 *
 * The data-backed stats (live counts of menus/categories/items) land in
 * Sprint 4B once the admin summary endpoint is exposed. For now we
 * render placeholder cards with a "soon" hint.
 *
 * Auth check: the parent layout already verified /api/v1/me with a
 * valid session, so by the time we render here the user is signed in.
 */
export default async function DashboardPage() {
  // Touch the cookie header so Next.js knows this page depends on the
  // request cookies (and doesn't try to cache it). The value is also
  // exposed for future RSC fetches that need to forward cookies.
  const _cookieHeader = readCookieHeader();

  // Defence-in-depth: if somehow the layout's auth check was bypassed
  // (e.g. direct route hit while cookies were clearing), bounce to login.
  // Redirect is OUTSIDE any try/catch on purpose — see the login page for
  // why wrapping it swallows the NEXT_REDIRECT exception.
  const { redirect } = await import("next/navigation");
  if (!cookies().get("qr_sessionid")?.value) {
    redirect("/login?next=" + DEFAULT_NEXT);
  }

  // V1: stats are placeholders until the admin summary endpoint (4C).
  const stats: DashboardStats = {
    menuCount: 0,
    categoryCount: 0,
    itemCount: 0,
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Welcome */}
      <header className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Hoş geldin
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-text">
          Admin paneli
        </h1>
        <p className="mt-1 text-sm text-muted">
          Bugün menünüze yeni ürünler ekleyebilir, fiyatları güncelleyebilir
          veya temanızı özelleştirebilirsiniz.
        </p>
      </header>

      {/* Stats — placeholders for Sprint 4B */}
      <section
        aria-label="Hızlı istatistikler"
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      >
        <StatCard label="Menü" value={stats.menuCount} hint="Yayında" />
        <StatCard label="Kategori" value={stats.categoryCount} hint="Toplam" />
        <StatCard label="Ürün" value={stats.itemCount} hint="Aktif" />
      </section>

      {/* Empty state — first-run guidance */}
      <section aria-label="Başlangıç" className="mt-2">
        <AdminEmptyState
          title="Henüz menünüz yok"
          message="Sprint 4B ile menü oluşturma, kategori yönetimi ve ürün ekleme akışları eklenecek. Bu arada işletme bilgilerinizi ve temanızı ayarlayabilirsiniz."
          icon={<ChefHat className="h-8 w-8" aria-hidden />}
        />
      </section>

      {/* Quick links */}
      <section
        aria-label="Hızlı işlemler"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <QuickLink
          href="/admin/business"
          title="İşletme bilgileri"
          description="Logo, iletişim ve adres bilgilerini düzenleyin."
          icon={<Store className="h-5 w-5" aria-hidden />}
        />
        <QuickLink
          href="/admin/theme"
          title="Tema ayarları"
          description="Renk paleti ve yerleşim seçeneklerini özelleştirin."
          icon={<Palette className="h-5 w-5" aria-hidden />}
        />
      </section>

      <p className="text-center text-xs text-muted">
        <Sparkles className="mr-1 inline h-3 w-3 align-text-bottom" />
        Detaylı istatistikler ve son aktiviteler Sprint 4C ile eklenecek.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl font-bold text-text">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
  icon,
  comingSoon = false,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  comingSoon?: boolean;
}) {
  const inner = (
    <div
      className={
        "group flex h-full items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition " +
        (comingSoon
          ? "opacity-70"
          : "hover:border-primary/40 hover:shadow-card")
      }
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-heading text-base font-semibold text-text">
            {title}
          </p>
          {comingSoon ? (
            <span className="rounded-full bg-muted/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              yakında
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
  if (comingSoon) {
    return (
      <div aria-disabled tabIndex={-1} className="cursor-not-allowed">
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {inner}
    </Link>
  );
}
