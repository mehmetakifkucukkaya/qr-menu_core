import { cookies } from "next/headers";
import { BarChart3, CalendarDays, Sparkles } from "lucide-react";

import { DailyViewsChart } from "@/app/(admin)/_components/DailyViewsChart";
import { EventBreakdown } from "@/app/(admin)/_components/EventBreakdown";
import { LanguageDistribution } from "@/app/(admin)/_components/LanguageDistribution";
import { TopQRCodes } from "@/app/(admin)/_components/TopQRCodes";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import { fetchAnalyticsOverview, AdminApiError } from "@/lib/api-admin";

const DEFAULT_NEXT = "/admin/analytics";
const WINDOW_DAYS = 30;

// /admin/analytics — server component, depends on cookies + the
// request user, so opt out of static prerender.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

/**
 * /admin/analytics — operator-facing analytics dashboard.
 *
 * Sprint 5B-2 scope:
 *   - 3 stat cards: today / week / month `menu_view` totals
 *   - Event-type breakdown (5 rows, bar list)
 *   - Daily views chart (last 30 days, inline SVG)
 *   - Language distribution (TR/EN donut)
 *   - Top 5 QR codes by scan_count
 *   - Empty state when no events have been recorded yet
 *
 * Auth check: the parent layout already verified /api/v1/me. We
 * additionally check `qr_sessionid` here as defence-in-depth (the
 * dashboard does the same).
 */
export default async function AnalyticsPage() {
  const cookieHeader = readCookieHeader();

  // Defence-in-depth redirect — wraps the `redirect()` outside try/catch
  // so the NEXT_REDIRECT exception isn't swallowed.
  const { redirect } = await import("next/navigation");
  if (!cookies().get("qr_sessionid")?.value) {
    redirect("/login?next=" + DEFAULT_NEXT);
  }

  let overview;
  let fetchError: string | null = null;
  try {
    overview = await fetchAnalyticsOverview(WINDOW_DAYS, {
      internal: true,
      cookieHeader,
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      fetchError = err.message;
    } else {
      fetchError = err instanceof Error ? err.message : "Bilinmeyen hata";
    }
    overview = null;
  }

  const hasActivity = overview
    ? overview.month_views > 0 || overview.event_counts.menu_view > 0
    : false;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      {/* Header */}
      <header className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          Pazarlama
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary"
            >
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-heading text-2xl font-bold text-text">
                Analitik
              </h1>
              <p className="mt-1 text-sm text-muted">
                Public menünüzden gelen anonim kullanım verileri.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted">
            <CalendarDays className="h-3.5 w-3.5" />
            Son {WINDOW_DAYS} gün
          </span>
        </div>
      </header>

      {/* Fetch error banner (non-blocking) */}
      {fetchError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          Analitik verileri yüklenirken bir hata oluştu. Sayfayı yenilemeyi
          deneyin. ({fetchError})
        </div>
      ) : null}

      {/* Stat cards */}
      {overview ? (
        <section
          aria-label="Hızlı istatistikler"
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <StatCard
            label="Bugün"
            value={overview.today_views}
            hint="menü görüntülenme"
          />
          <StatCard
            label="Bu hafta"
            value={overview.week_views}
            hint="son 7 gün"
          />
          <StatCard
            label="Bu ay"
            value={overview.month_views}
            hint="son 30 gün"
          />
        </section>
      ) : null}

      {/* Empty state when no overview + no error */}
      {!overview && !fetchError ? (
        <AdminEmptyState
          icon={<BarChart3 className="h-8 w-8" aria-hidden />}
          title="Henüz analitik verisi yok"
          message="Public menünüz ziyaret edildiğinde burada görünecek."
        />
      ) : null}

      {/* All-zero fallback: the overview responded, but the tenant
          hasn't received a single event yet. We still render the layout
          so the operator can see the "zero" state of every panel — it
          doubles as a smoke check that every chart renders correctly. */}
      {overview && !hasActivity ? (
        <AdminEmptyState
          icon={<BarChart3 className="h-8 w-8" aria-hidden />}
          title="Henüz aktivite yok"
          message="Public menüye birkaç ziyaret geldiğinde bu sayfa dolmaya başlayacak."
        />
      ) : null}

      {/* Breakdowns row: events + language */}
      {overview && hasActivity ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <EventBreakdown counts={overview.event_counts} />
          </div>
          <div className="lg:col-span-2">
            <LanguageDistribution
              distribution={overview.language_distribution}
            />
          </div>
        </div>
      ) : null}

      {/* Daily views (full width) */}
      {overview && hasActivity ? (
        <DailyViewsChart data={overview.daily_views} windowDays={WINDOW_DAYS} />
      ) : null}

      {/* Top QR codes (full width) */}
      {overview ? <TopQRCodes codes={overview.top_qr_codes} /> : null}

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        <Sparkles className="mr-1 inline h-3 w-3 align-text-bottom" />
        IP adresi ve tarayıcı bilgisi hash&apos;li olarak saklanır. Plain
        metin kaydedilmez (D-017).
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
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl font-bold tabular-nums text-text">
        {value.toLocaleString("tr-TR")}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
