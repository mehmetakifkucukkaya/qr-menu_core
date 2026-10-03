"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  Hourglass,
  ChefHat,
  Bell,
  PackageCheck,
  X,
  RefreshCw,
  Receipt,
  ArrowLeft,
  ShoppingBag,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import {
  fetchOrderStatus,
  OrdersApiError,
  type OrderStatus,
  type OrderStatusResponse,
} from "@/lib/api-orders";

interface PageProps {
  params: { businessSlug: string; orderNumber: string };
}

const POLL_INTERVAL_MS = 15_000;

/**
 * Order confirmation page — Sprint 8B.
 *
 * - Server-rendered initial payload via `/api/v1/public/orders/{number}/status`.
 * - Polls every 15 s (POLL_INTERVAL_MS) to surface admin-side status changes.
 * - Visual status timeline (placed → confirmed → preparing → ready → delivered).
 * - "Yeni sipariş ver" link back to the menu page.
 * - Stops polling once a terminal status (delivered / cancelled) is reached.
 */
export default function OrderConfirmationPage({ params }: PageProps) {
  const { businessSlug, orderNumber } = params;

  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; data: OrderStatusResponse }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  const pollingRef = useRef(false);

  const load = useCallback(
    async (showSpinner: boolean): Promise<OrderStatusResponse | null> => {
      try {
        const data = await fetchOrderStatus(orderNumber);
        setState({ kind: "ok", data });
        return data;
      } catch (err) {
        const msg =
          err instanceof OrdersApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Sipariş durumu alınamadı.";
        if (showSpinner) {
          setState({ kind: "error", message: msg });
        }
        return null;
      }
    },
    [orderNumber],
  );

  // Initial load + 15 s polling.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (first: boolean) => {
      if (cancelled) return;
      const result = await load(first);
      if (cancelled) return;
      const terminal =
        result && (result.status === "delivered" || result.status === "cancelled");
      if (!terminal && !pollingRef.current) {
        timer = setTimeout(() => tick(false), POLL_INTERVAL_MS);
      }
    };

    tick(true);

    return () => {
      cancelled = true;
      pollingRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          >
            M
          </span>
          <span className="font-heading text-sm font-semibold text-text">
            Sipariş Takip
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-6">
        <OrderHeader
          orderNumber={orderNumber}
          status={state.kind === "ok" ? state.data.status : null}
        />

        {state.kind === "loading" ? (
          <p className="mt-6 text-center text-sm text-muted">
            Sipariş durumu yükleniyor…
          </p>
        ) : state.kind === "error" ? (
          <ErrorBanner
            message={state.message}
            onRetry={() => {
              setState({ kind: "loading" });
              load(true);
            }}
          />
        ) : (
          <OrderDetail data={state.data} businessSlug={businessSlug} />
        )}

        <div className="mt-8 text-center">
          <Link
            href={`/m/${businessSlug}`}
            className={buttonStyles({ variant: "primary", size: "md" })}
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            Yeni sipariş ver
          </Link>
        </div>
      </section>
    </main>
  );
}

function OrderHeader({
  orderNumber,
  status,
}: {
  orderNumber: string;
  status: OrderStatus | null;
}) {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        Sipariş No
      </p>
      <h1 className="mt-1 font-heading text-2xl font-bold text-text sm:text-3xl">
        {orderNumber}
      </h1>
      {status ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {statusLabel(status)} · {statusDescription(status)}
        </p>
      ) : null}
    </div>
  );
}

function OrderDetail({
  data,
  businessSlug,
}: {
  data: OrderStatusResponse;
  businessSlug: string;
}) {
  return (
    <div className="mt-8 space-y-6">
      <StatusTimeline status={data.status} data={data} />

      <p className="text-center text-xs text-muted">
        Bu sayfa her 15 saniyede otomatik güncellenir. Sayfayı kapatıp
        tekrar açabilirsiniz.
      </p>

      <div className="text-center">
        <Link
          href={`/m/${businessSlug}`}
          className={buttonStyles({ variant: "outline", size: "md" })}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Menüye dön
        </Link>
      </div>
    </div>
  );
}

function StatusTimeline({
  status,
  data,
}: {
  status: OrderStatus;
  data: OrderStatusResponse;
}) {
  // Map backend status → milestone index in the linear path:
  //   pending (0) → confirmed (1) → preparing (2) → ready (3) → delivered (4)
  // Cancelled is a branch off the path.
  const STEPS: Array<{
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    timestampKey: keyof OrderStatusResponse | null;
  }> = [
    {
      key: "pending",
      label: "Sipariş Alındı",
      description: "İşletmeye iletildi, onay bekleniyor.",
      icon: Hourglass,
      timestampKey: "placed_at",
    },
    {
      key: "confirmed",
      label: "Onaylandı",
      description: "İşletme siparişi kabul etti.",
      icon: Check,
      timestampKey: "confirmed_at",
    },
    {
      key: "preparing",
      label: "Hazırlanıyor",
      description: "Mutfakta hazırlanıyor.",
      icon: ChefHat,
      timestampKey: "preparing_at",
    },
    {
      key: "ready",
      label: "Hazır",
      description: "Siparişiniz hazır, teslim edilebilir.",
      icon: Bell,
      timestampKey: "ready_at",
    },
    {
      key: "delivered",
      label: "Teslim Edildi",
      description: "Afiyet olsun!",
      icon: PackageCheck,
      timestampKey: "delivered_at",
    },
  ];

  const isCancelled = status === "cancelled";
  const currentIndex = isCancelled
    ? -1
    : STEPS.findIndex((s) => s.key === status);

  return (
    <ol
      aria-label="Sipariş durumu"
      className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-card"
    >
      {STEPS.map((step, idx) => {
        const Icon = step.icon;
        const ts =
          step.timestampKey != null
            ? (data[step.timestampKey] as string | null)
            : null;
        // State: passed (idx < currentIndex), active (idx === currentIndex),
        // pending (idx > currentIndex). Cancelled → all cancelled.
        const passed = !isCancelled && idx < currentIndex;
        const active = !isCancelled && idx === currentIndex;
        const muted = !isCancelled && idx > currentIndex;

        return (
          <li
            key={step.key}
            className={
              "flex items-start gap-3 rounded-lg p-2 transition " +
              (active ? "bg-primary/5 ring-1 ring-primary/30" : "")
            }
          >
            <div
              className={
                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full " +
                (passed
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20 animate-[pulse-ring_1.6s_ease-in-out_infinite]"
                    : "bg-muted/30 text-muted")
              }
            >
              {passed ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Icon className="h-4 w-4" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={
                  "text-sm font-semibold " +
                  (muted ? "text-muted" : "text-text")
                }
              >
                {step.label}
                {active ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                    <Clock className="h-3 w-3" aria-hidden />
                    Şu an
                  </span>
                ) : null}
              </p>
              <p className={"text-xs " + (muted ? "text-muted/70" : "text-muted")}>
                {step.description}
                {ts ? (
                  <>
                    {" · "}
                    <time dateTime={ts}>{formatTimestamp(ts)}</time>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}

      {isCancelled ? (
        <li className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft p-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/20 text-danger">
            <X className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger">İptal Edildi</p>
            <p className="text-xs text-muted">
              Sipariş iptal edildi
              {data.cancelled_at
                ? ` · ${formatTimestamp(data.cancelled_at)}`
                : null}
              .
            </p>
          </div>
        </li>
      ) : null}
    </ol>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-danger/30 bg-danger-soft p-4 text-center"
    >
      <Receipt className="mx-auto mb-2 h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm font-semibold text-text">
        Sipariş bilgisi yüklenemedi
      </p>
      <p className="mt-1 text-xs text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:border-primary hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Tekrar dene
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "Beklemede";
    case "confirmed":
      return "Onaylandı";
    case "preparing":
      return "Hazırlanıyor";
    case "ready":
      return "Hazır";
    case "delivered":
      return "Teslim Edildi";
    case "cancelled":
      return "İptal Edildi";
  }
}

function statusDescription(status: OrderStatus): string {
  switch (status) {
    case "pending":
      return "İşletme onayı bekleniyor";
    case "confirmed":
      return "Hazırlık başlıyor";
    case "preparing":
      return "Mutfakta hazırlanıyor";
    case "ready":
      return "Siparişiniz hazır";
    case "delivered":
      return "Afiyet olsun";
    case "cancelled":
      return "Sipariş iptal edildi";
  }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    });
  } catch {
    return iso;
  }
}