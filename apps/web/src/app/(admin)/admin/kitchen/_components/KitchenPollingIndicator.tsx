"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface KitchenPollingIndicatorProps {
  /** How often the parent re-fetches (in ms). We expose this so the "X saniye
   *  önce" label can resync on the same cadence as the polling tick. */
  pollIntervalMs: number;
  /** Last successful server render time. Used to seed the "X saniye önce"
   *  counter without waiting for the next tick. */
  initialFetchedAt: number;
}

/**
 * KitchenPollingIndicator — small "X saniye önce güncellendi" pill with a
 * manual refresh button.
 *
 * Two responsibilities:
 *   1. Live counter that ticks every second so the operator sees the age
 *      of the last successful data load.
 *   2. `router.refresh()` button — kicks a server roundtrip immediately
 *      without waiting for the next interval.
 *
 * Polling itself lives in the parent (10 s `setInterval`). This component
 * only renders the indicator + manual refresh button.
 */
export function KitchenPollingIndicator({
  pollIntervalMs,
  initialFetchedAt,
}: KitchenPollingIndicatorProps) {
  const router = useRouter();
  const [fetchedAt, setFetchedAt] = useState<number>(initialFetchedAt);
  const [refreshing, setRefreshing] = useState(false);

  // Tick the "X saniye önce" label every second.
  useEffect(() => {
    const timer = setInterval(() => {
      // Re-render is enough — the computed `secondsAgo` depends on `Date.now()`.
      setFetchedAt((prev) => prev);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Re-sync the counter to the server's clock every poll tick. The parent
  // already calls `router.refresh()`, which causes this component to
  // re-render with a new `initialFetchedAt` value via `key` on the page.
  useEffect(() => {
    setFetchedAt(initialFetchedAt);
  }, [initialFetchedAt]);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    // Reset the spinner shortly after the navigation completes.
    window.setTimeout(() => setRefreshing(false), pollIntervalMs);
  };

  const secondsAgo = Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
  const label =
    secondsAgo < 5
      ? "Az önce güncellendi"
      : secondsAgo < 60
        ? `${secondsAgo} saniye önce güncellendi`
        : `${Math.floor(secondsAgo / 60)} dakika önce güncellendi`;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted shadow-sm">
      <span
        aria-hidden
        className="relative flex h-2 w-2"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span>{label}</span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
        aria-label="Şimdi yenile"
      >
        <RefreshCw
          className={
            "h-3 w-3 " + (refreshing ? "animate-spin text-primary" : "")
          }
          aria-hidden
        />
        Yenile
      </button>
    </div>
  );
}
