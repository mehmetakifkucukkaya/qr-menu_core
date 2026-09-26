import { cookies } from "next/headers";
import Link from "next/link";
import {
  ChefHat,
  Store,
  Palette,
  Sparkles,
  Activity,
} from "lucide-react";

import { AdminEmptyState } from "../../_components/EmptyState";
import { fetchAdminSummary } from "@/lib/api-admin";
import type { AuditEvent, AuditAction } from "@/types/admin";

const DEFAULT_NEXT = "/admin/dashboard";

// Dashboard renders personalized content from the request cookie; opt out
// of static prerender so Next.js doesn't try to bake it at build time.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Read the entire Cookie header so we can forward it on outgoing fetches. */
function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * Human-friendly label for an AuditAction. The i18n keys would normally live
 * in a translation file; for V1 we keep them inline (admin-only surface,
 * one locale).
 */
const ACTION_LABEL: Record<AuditAction, string> = {
  created: "oluşturuldu",
  updated: "güncellendi",
  deleted: "silindi",
  price_changed: "fiyat değişti",
  published: "yayınlandı",
  unpublished: "yayından kaldırıldı",
  deactivated: "pasife alındı",
  reactivated: "aktifleştirildi",
  reordered: "sıralandı",
};

/**
 * Compact human summary for an event's payload. We only enrich the most
 * common actions (price_changed) — everything else falls back to a generic
 * "X işlemi gerçekleşti" string.
 */
function payloadSummary(action: AuditAction, payload: Record<string, unknown>): string | null {
  if (action === "price_changed") {
    const oldVal = typeof payload.old === "string" ? payload.old : null;
    const newVal = typeof payload.new === "string" ? payload.new : null;
    if (oldVal !== null && newVal !== null) return `${oldVal} → ${newVal}`;
  }
  return null;
}

/** Relative time formatter (TR locale, no seconds — kept light for V1). */
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} gün önce`;
  const months = Math.floor(days / 30);
  return `${months} ay önce`;
}

/**
 * /admin/dashboard — landing page after login.
 *
 * Sprint 4C scope:
 *   - Welcome banner
 *   - Live stat cards (menus/categories/items/branches/active items)
 *   - Recent audit events list (last 10, newest first)
 *   - Quick links (business, theme)
 *
 * Auth check: the parent layout already verified /api/v1/me with a valid
 * session, so by the time we render here the user is signed in. We
 * also re-check the cookie here as a defence-in-depth redirect.
 */
export default async function DashboardPage() {
  // Touch the cookie header so Next.js knows this page depends on the
  // request cookies (and doesn't try to cache it). The value is also
  // forwarded to the admin summary fetch.
  const cookieHeader = readCookieHeader();

  // Defence-in-depth: redirect OUTSIDE any try/catch — wrapping it
  // swallows the NEXT_REDIRECT exception (see login page for the full story).
  const { redirect } = await import("next/navigation");
  if (!cookies().get("qr_sessionid")?.value) {
    redirect("/login?next=" + DEFAULT_NEXT);
  }

  // Fetch the admin summary. If the call fails (network glitch, transient
  // 5xx), surface a friendly error card instead of crashing the page.
  let summary;
  let fetchError: string | null = null;
  try {
    summary = await fetchAdminSummary({ cookieHeader });
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "Bilinmeyen hata";
    summary = null;
  }

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
          {summary?.organization ? (
            <>
              <span className="font-medium text-text">{summary.organization.name}</span>{" "}
              işletmesi için özet.
            </>
          ) : (
            <>Bugün menünüze yeni ürünler ekleyebilir, fiyatları güncelleyebilir veya temanızı özelleştirebilirsiniz.</>
          )}
        </p>
      </header>

      {/* Fetch error banner (non-blocking) */}
      {fetchError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          Özet yüklenirken bir hata oluştu. Sayfayı yenilemeyi deneyin. ({fetchError})
        </div>
      ) : null}

      {/* Live stat cards */}
      {summary ? (
        <section
          aria-label="Hızlı istatistikler"
          className="grid grid-cols-2 gap-4 sm:grid-cols-5"
        >
          <StatCard label="Menü" value={summary.menu_count} hint="Yayında" />
          <StatCard label="Kategori" value={summary.category_count} hint="Toplam" />
          <StatCard label="Ürün" value={summary.item_count} hint="Aktif" />
          <StatCard label="Şube" value={summary.branch_count} hint="Aktif" />
          <StatCard
            label="Canlı ürün"
            value={summary.active_item_count}
            hint="Tükenmemiş"
          />
        </section>
      ) : null}

      {/* Recent audit events */}
      {summary ? (
        <section
          aria-label="Son aktiviteler"
          className="rounded-xl border border-border bg-surface p-5 shadow-sm"
        >
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-text">
              <Activity className="h-4 w-4 text-primary" aria-hidden />
              Son aktiviteler
            </h2>
            <span className="text-xs text-muted">
              son {summary.recent_events.length} olay
            </span>
          </header>
          {summary.recent_events.length === 0 ? (
            <AdminEmptyState
              title="Henüz aktivite yok"
              message="Menü veya ürün değişiklikleri burada görünecek."
              icon={<ChefHat className="h-8 w-8" aria-hidden />}
            />
          ) : (
            <ul className="divide-y divide-border">
              {summary.recent_events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
        Modern Cafe demo verisiyle dolu. Fiyat değişiklikleri admin&apos;den
        public menüye anlık yansır.
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

function EventRow({ event }: { event: AuditEvent }) {
  const summary = payloadSummary(event.action, event.payload);
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">
          <span className="font-medium">{event.target_repr}</span>{" "}
          <span className="text-muted">{ACTION_LABEL[event.action]}</span>
        </p>
        {summary ? (
          <p className="mt-0.5 font-mono text-xs text-primary">{summary}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted">
          {event.actor} · {event.target_type}
        </p>
      </div>
      <time
        dateTime={event.created_at}
        className="shrink-0 text-xs text-muted"
      >
        {formatRelative(event.created_at)}
      </time>
    </li>
  );
}

function QuickLink({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-base font-semibold text-text">
            {title}
          </p>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
    </Link>
  );
}
