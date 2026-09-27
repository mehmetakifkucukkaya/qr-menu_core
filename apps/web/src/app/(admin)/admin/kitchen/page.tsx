import { cookies } from "next/headers";
import Link from "next/link";
import { Receipt } from "lucide-react";

import {
  fetchKitchenTickets,
  AdminApiError,
  type KitchenStatusFilter,
  type KitchenTicket,
} from "@/lib/api-admin";
import { AdminEmptyState } from "@/app/(admin)/_components/EmptyState";
import { AdminErrorState } from "@/app/(admin)/_components/ErrorState";

import { KitchenTicketCard } from "./_components/KitchenTicketCard";
import { KitchenPollingIndicator } from "./_components/KitchenPollingIndicator";
import { KitchenStatusTabs } from "./_components/KitchenStatusTabs";
import { KitchenAutoRefresher } from "./_components/KitchenAutoRefresher";

// Kitchen display refreshes every 10 s — operator-grade live view, but
// still server-rendered (the API has no websocket endpoint).
const POLL_INTERVAL_MS = 10_000;

// The page reads cookies on every render. Opt out of static prerender so
// Next.js doesn't try to bake it at build time (would error out anyway).
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readCookieHeader(): string {
  return cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

const STATUS_VALUES: KitchenStatusFilter[] = [
  "pending",
  "confirmed",
  "preparing",
  "all",
];

function resolveStatus(raw?: string): KitchenStatusFilter {
  // Default tab is `pending` — operators almost always care about new
  // orders first. `?status=...` mirrors the same set the tab UI exposes.
  if (!raw) return "pending";
  return (STATUS_VALUES as string[]).includes(raw)
    ? (raw as KitchenStatusFilter)
    : "pending";
}

interface PageProps {
  searchParams: { status?: string };
}

/**
 * /admin/kitchen — mutfak ekranı.
 *
 * Full-grid layout, designed for a wall tablet in a restaurant kitchen:
 *   - Top bar: title + polling indicator (`Az önce güncellendi`) + tab
 *     filters with live counts.
 *   - Grid: 1–4 column responsive. Each ticket is rendered with
 *     `KitchenTicketCard` (client island for state transitions).
 *   - Pending/confirmed tickets subtly pulse via the `kitchen-ticket-pending`
 *     class so the cook sees work piling up without staring at the list.
 *
 * Data flow:
 *   - Server component fetches all 4 status buckets in parallel (active list
 *     + tab badge counts).
 *   - `KitchenAutoRefresher` (invisible client island) calls
 *     `router.refresh()` every 10 s so the parent re-runs the data fetch.
 *   - Ticket cards only refresh themselves after a successful state
 *     transition (no auto-poll on the card itself).
 */
export default async function KitchenPage({ searchParams }: PageProps) {
  const cookieHeader = readCookieHeader();
  const csrfToken = cookies().get("qr_csrftoken")?.value ?? null;

  const status = resolveStatus(searchParams.status);

  let activeTickets: KitchenTicket[] = [];
  let counts: Record<KitchenStatusFilter, number> = {
    pending: 0,
    confirmed: 0,
    preparing: 0,
    all: 0,
  };
  let loadError: string | null = null;

  try {
    const [pending, confirmed, preparing, all] = await Promise.all([
      fetchKitchenTickets(["pending"], { internal: true, cookieHeader }),
      fetchKitchenTickets(["confirmed"], { internal: true, cookieHeader }),
      fetchKitchenTickets(["preparing"], { internal: true, cookieHeader }),
      fetchKitchenTickets(["all"], { internal: true, cookieHeader }),
    ]);

    counts.pending = pending.length;
    counts.confirmed = confirmed.length;
    counts.preparing = preparing.length;
    counts.all = all.length;

    if (status === "pending") activeTickets = pending;
    else if (status === "confirmed") activeTickets = confirmed;
    else if (status === "preparing") activeTickets = preparing;
    else activeTickets = all;
  } catch (err) {
    if (err instanceof AdminApiError) {
      loadError = err.message;
    } else {
      throw err;
    }
  }

  // Timestamp used as the polling indicator's seed value + a `key` on the
  // indicator instance so re-renders restart its "X saniye önce" counter.
  const fetchedAt = Date.now();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            Operasyon
          </p>
          <h1 className="font-heading text-2xl font-bold text-text">
            Mutfak Ekranı
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Bekleyen, onaylanan ve hazırlanan siparişler. Onayla → Hazırla →
            Teslim Et akışı ile müşteriye anlık bildirim gider.
          </p>
        </div>
        {/* `key={fetchedAt}` forces a fresh child instance after every
            router.refresh() so the inner tick restarts from a new seed. */}
        <KitchenPollingIndicator
          key={`poll-${fetchedAt}`}
          pollIntervalMs={POLL_INTERVAL_MS}
          initialFetchedAt={fetchedAt}
        />
      </header>

      {/* Tab filters with live counts. */}
      <KitchenStatusTabs counts={counts} />

      {/* Polling owner — invisible client island that re-fetches the
          server data on a 10 s interval. */}
      <KitchenAutoRefresher intervalMs={POLL_INTERVAL_MS} />

      {/* Grid */}
      {loadError ? (
        <AdminErrorState
          title="Siparişler yüklenemedi"
          message={loadError}
          code="admin.kitchen.tickets_failed"
        />
      ) : activeTickets.length === 0 ? (
        <AdminEmptyState
          icon={<Receipt className="h-8 w-8" aria-hidden />}
          title={
            status === "all"
              ? "Hiç sipariş yok"
              : status === "pending"
                ? "Bekleyen sipariş yok"
                : status === "confirmed"
                  ? "Onaylanmış sipariş yok"
                  : "Hazırlanan sipariş yok"
          }
          message={
            status === "pending"
              ? "Yeni sipariş geldiğinde burada belirecek."
              : status === "all"
                ? "Müşteri sipariş verdiğinde burada görünecek."
                : "Durumu güncellenen siparişler diğer sekmelere taşındı."
          }
          action={
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Sipariş listesini aç
            </Link>
          }
        />
      ) : (
        <section
          aria-label="Aktif siparişler"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {activeTickets.map((t) => (
            <KitchenTicketCard
              key={t.id}
              orderId={t.id}
              orderNumber={t.order_number}
              status={t.status}
              tableNumber={t.table_number}
              customerName={t.customer_name}
              customerPhone={t.customer_phone}
              branchName={t.branch_name}
              timeSincePlacedSeconds={t.time_since_placed_seconds}
              placedAt={t.placed_at}
              items={t.items.map((it) => ({
                id: it.id,
                name: it.name,
                quantity: it.quantity,
                notes: it.notes,
              }))}
              csrfToken={csrfToken}
            />
          ))}
        </section>
      )}

      <p className="rounded-md border border-dashed border-border bg-background px-3 py-2 text-center text-xs text-muted">
        Ekran otomatik olarak {POLL_INTERVAL_MS / 1000} saniyede bir yenilenir.
        Manuel yenileme için &quot;Yenile&quot; düğmesini kullanın. Hazırlanan
        sipariş kartları yumuşak bir animasyonla vurgulanır.
      </p>
    </div>
  );
}
