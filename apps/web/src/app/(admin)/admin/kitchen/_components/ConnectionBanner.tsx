"use client";

import { WifiOff } from "lucide-react";

import { formatTime } from "@/lib/datetime";

export interface ConnectionBannerProps {
  /** Polls that failed in a row; 0 means the connection is fine. */
  failures: number;
  /** When the screen last got fresh orders (browser clock, ms); `null` if it never did. */
  lastUpdateMs: number | null;
  /** The server answered 401/403: the session is over, which a new sign-in fixes. */
  sessionEnded: boolean;
}

/**
 * The strip above the board when it cannot reach the server. The orders that
 * were last received stay below it, so the kitchen keeps cooking from them;
 * the screen refreshes itself the moment the connection is back.
 */
export function ConnectionBanner({ failures, lastUpdateMs, sessionEnded }: ConnectionBannerProps) {
  if (sessionEnded) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-danger bg-danger-soft px-4 py-3 text-lg font-semibold text-danger"
      >
        <span>Oturumunuz sona erdi. Siparişler artık güncellenmiyor.</span>
        <a
          href="/login?next=/admin/kitchen"
          className="inline-flex min-h-12 items-center rounded-xl bg-danger px-5 text-lg font-bold text-background"
        >
          Yeniden giriş yap
        </a>
      </div>
    );
  }
  if (failures === 0) return null;

  return (
    <div
      role="status"
      data-testid="connection-banner"
      className="flex items-center gap-3 rounded-2xl border-2 border-danger bg-danger-soft px-4 py-3 text-danger"
    >
      <WifiOff className="h-7 w-7 shrink-0" aria-hidden />
      <p className="text-lg font-semibold">
        Bağlantı yok · son güncelleme {lastUpdateMs === null ? "—" : formatTime(lastUpdateMs)}
        <span className="block text-base font-normal">
          Ekranda son alınan siparişler görünüyor. Bağlantı gelince kendiliğinden yenilenir.
        </span>
      </p>
    </div>
  );
}
