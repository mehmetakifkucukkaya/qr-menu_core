import { cookies } from "next/headers";
import Link from "next/link";
import {
  Activity,
  ArrowUpDown,
  Building2,
  ChefHat,
  ExternalLink,
  Eye,
  EyeOff,
  FolderTree,
  Package,
  Palette,
  Pencil,
  Plus,
  Power,
  PowerOff,
  QrCode,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { AdminEmptyState } from "../../_components/EmptyState";
import { buttonStyles } from "@/components/ui/Button";
import { fetchAdminSummary } from "@/lib/api-admin";
import type { AuditEvent } from "@/types/admin";

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
 * Human-friendly label for an audit action. The i18n keys would normally live
 * in a translation file; for V1 we keep them inline (admin-only surface,
 * one locale).
 *
 * The backend records far more actions than the first nine (orders, AI menu
 * import, billing, loyalty, sign-up...), and it keeps adding them. Every lookup
 * below is therefore total: an action nobody has dressed yet gets a neutral
 * label and icon. Indexing a fixed table and destructuring the result used to
 * take the whole dashboard down ("Application error: a server-side exception
 * has occurred") the moment a customer placed an order.
 */
const ACTION_LABEL: Record<string, string> = {
  created: "oluşturuldu",
  updated: "güncellendi",
  deleted: "silindi",
  price_changed: "fiyat değişti",
  published: "yayınlandı",
  unpublished: "yayından kaldırıldı",
  deactivated: "pasife alındı",
  reactivated: "aktifleştirildi",
  reordered: "sıralandı",
  // Orders: the events a restaurant sees most.
  order_placed: "sipariş alındı",
  order_confirmed: "sipariş onaylandı",
  order_preparing: "hazırlanıyor",
  order_ready: "hazır",
  order_delivered: "teslim edildi",
  order_cancelled: "iptal edildi",
  order_paid: "ödemesi alındı",
  order_refunded: "iade edildi",
};
const FALLBACK_ACTION_LABEL = "işlem yapıldı";

interface ActionStyle {
  icon: LucideIcon;
  tone: string;
}

const ORDER_STYLE: ActionStyle = { icon: ShoppingBag, tone: "bg-primary-soft text-primary" };

/** Icon + tint per action, so the feed can be scanned by shape and colour. */
const ACTION_STYLE: Record<string, ActionStyle> = {
  created: { icon: Plus, tone: "bg-success-soft text-success" },
  updated: { icon: Pencil, tone: "bg-primary-soft text-primary" },
  deleted: { icon: Trash2, tone: "bg-danger-soft text-danger" },
  price_changed: { icon: Tag, tone: "bg-warning-soft text-warning" },
  published: { icon: Eye, tone: "bg-success-soft text-success" },
  unpublished: { icon: EyeOff, tone: "bg-surface-low text-muted" },
  deactivated: { icon: PowerOff, tone: "bg-surface-low text-muted" },
  reactivated: { icon: Power, tone: "bg-success-soft text-success" },
  reordered: { icon: ArrowUpDown, tone: "bg-surface-low text-muted" },
  order_placed: { ...ORDER_STYLE, tone: "bg-success-soft text-success" },
  order_confirmed: ORDER_STYLE,
  order_preparing: ORDER_STYLE,
  order_ready: ORDER_STYLE,
  order_delivered: ORDER_STYLE,
  order_paid: ORDER_STYLE,
  order_cancelled: { ...ORDER_STYLE, tone: "bg-danger-soft text-danger" },
  order_refunded: { ...ORDER_STYLE, tone: "bg-danger-soft text-danger" },
};
const FALLBACK_ACTION_STYLE: ActionStyle = {
  icon: Activity,
  tone: "bg-surface-low text-muted",
};

const TARGET_LABEL: Record<string, string> = {
  menu: "menü",
  category: "kategori",
  item: "ürün",
  branch: "şube",
  theme: "tema",
  organization: "işletme",
  order: "sipariş",
  payment: "ödeme",
  customer: "müşteri",
  menu_import_draft: "menü içe aktarma",
  plan_settings: "plan",
};

/**
 * Compact human summary for an event's payload. We only enrich the most
 * common actions (price_changed) — everything else falls back to a generic
 * "X işlemi gerçekleşti" string.
 */
function payloadSummary(action: string, payload: Record<string, unknown>): string | null {
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
 *   - Welcome banner with the two shortcuts an owner reaches for first
 *   - Live stat cards (menus/categories/items/branches/active items)
 *   - Recent audit events (last 10, newest first) as an icon feed
 *   - Quick links
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

  const slug = summary?.organization?.slug;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {/* Welcome */}
      <header className="relative overflow-hidden rounded-3xl bg-primary px-6 py-8 text-primary-foreground shadow-md sm:px-9 sm:py-10">
        <div
          aria-hidden
          className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-secondary/50 mix-blend-screen blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-28 left-1/3 h-64 w-96 rounded-full bg-accent blur-3xl"
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
          style={{
            backgroundImage:
              "radial-gradient(rgb(255 255 255 / 0.2) 1px, transparent 1.5px)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative">
          <p className="text-sm font-medium text-primary-foreground/80">
            Hoş geldin
          </p>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Admin Paneli
          </h1>
          <p className="mt-2 text-[0.9375rem] text-primary-foreground/85">
            {summary?.organization ? (
              <>
                <span className="font-semibold text-primary-foreground">
                  {summary.organization.name}
                </span>{" "}
                işletmesi için özet.
              </>
            ) : (
              <>
                Bugün menünüze yeni ürünler ekleyebilir, fiyatları
                güncelleyebilir veya temanızı özelleştirebilirsiniz.
              </>
            )}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {slug ? (
              <a
                href={`/m/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonStyles({ variant: "outline", size: "md" })}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Menüyü görüntüle
                <span className="sr-only"> (yeni sekmede açılır)</span>
              </a>
            ) : null}
            <Link
              href="/admin/qr-codes"
              className={buttonStyles({ variant: "inverse", size: "md" })}
            >
              <QrCode className="h-4 w-4" aria-hidden />
              QR kodlar
            </Link>
          </div>
        </div>
      </header>

      {/* Fetch error banner (non-blocking) */}
      {fetchError ? (
        <div
          role="alert"
          className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger"
        >
          Özet yüklenirken bir hata oluştu. Sayfayı yenilemeyi deneyin. ({fetchError})
        </div>
      ) : null}

      {/* Live stat cards */}
      {summary ? (
        <section
          aria-label="Hızlı istatistikler"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
        >
          <StatCard
            label="Menü"
            value={summary.menu_count}
            hint="Yayında"
            icon={<UtensilsCrossed className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Kategori"
            value={summary.category_count}
            hint="Toplam"
            icon={<FolderTree className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Ürün"
            value={summary.item_count}
            hint="Aktif"
            icon={<Package className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Şube"
            value={summary.branch_count}
            hint="Aktif"
            icon={<Store className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Canlı ürün"
            value={summary.active_item_count}
            hint="Tükenmemiş"
            icon={<Zap className="h-5 w-5" aria-hidden />}
          />
        </section>
      ) : null}

      {/* Recent audit events */}
      {summary ? (
        <section
          aria-label="Son aktiviteler"
          className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-border/60 sm:p-6"
        >
          <header className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-heading text-lg font-semibold text-text">
              Son Aktiviteler
            </h2>
            <span className="text-xs text-muted">
              son {summary.recent_events.length} olay
            </span>
          </header>
          {summary.recent_events.length === 0 ? (
            <AdminEmptyState
              title="Henüz aktivite yok"
              message="Menü veya ürün değişiklikleri burada görünecek."
              icon={<ChefHat className="h-7 w-7" aria-hidden />}
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
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
      >
        <QuickLink
          href="/admin/menus"
          title="Menüler"
          description="Kategori ve ürünleri ekleyin, fiyatları güncelleyin."
          icon={<UtensilsCrossed className="h-5 w-5" aria-hidden />}
        />
        <QuickLink
          href="/admin/qr-codes"
          title="QR kodlar"
          description="Masalarınız için QR kod oluşturun ve indirin."
          icon={<QrCode className="h-5 w-5" aria-hidden />}
        />
        <QuickLink
          href="/admin/business"
          title="İşletme bilgileri"
          description="Logo, iletişim ve adres bilgilerini düzenleyin."
          icon={<Building2 className="h-5 w-5" aria-hidden />}
        />
        <QuickLink
          href="/admin/theme"
          title="Tema ayarları"
          description="Renk paleti ve yerleşim seçeneklerini özelleştirin."
          icon={<Palette className="h-5 w-5" aria-hidden />}
        />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border/60 transition-shadow duration-200 hover:shadow-md sm:p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <p className="mt-4 font-heading text-3xl font-semibold tabular-nums leading-none text-text">
        {value}
      </p>
      <p className="mt-2 text-sm font-semibold text-text">{label}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const summary = payloadSummary(event.action, event.payload);
  const { icon: Icon, tone } = ACTION_STYLE[event.action] ?? FALLBACK_ACTION_STYLE;
  const actor = event.actor === "system" ? "Sistem" : event.actor;
  return (
    <li className="flex items-start gap-3.5 py-3.5">
      <span
        aria-hidden
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">
          <span className="font-medium">{event.target_repr}</span>{" "}
          <span className="text-muted">
            {ACTION_LABEL[event.action] ?? FALLBACK_ACTION_LABEL}
          </span>
        </p>
        {summary ? (
          <p className="mt-0.5 font-mono text-xs text-primary">{summary}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted">
          {actor} · {TARGET_LABEL[event.target_type] ?? event.target_type}
        </p>
      </div>
      <time
        dateTime={event.created_at}
        className="shrink-0 pt-0.5 text-xs text-muted"
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
      className="group block rounded-2xl bg-surface p-4 shadow-card ring-1 ring-border/60 transition-shadow duration-200 hover:shadow-md hover:ring-border-strong sm:p-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
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
