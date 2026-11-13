"use client";

import clsx from "clsx";

import { formatTime } from "@/lib/datetime";

export interface LiveStatusProps {
  /** Polls that failed in a row; 0 means the connection is fine. */
  failures: number;
  /** When the screen last got fresh orders (browser clock, ms); `null` before the first update. */
  lastUpdateMs: number | null;
}

const WITH_SECONDS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", second: "2-digit" };

/**
 * "Canlı · son güncelleme 14:32:40". A board that silently stopped looks just
 * like a quiet kitchen; a time that keeps moving every few seconds tells them
 * apart. When the connection is gone the strip below the title gives the details.
 */
export function LiveStatus({ failures, lastUpdateMs }: LiveStatusProps) {
  const state = failures > 0 ? "offline" : lastUpdateMs === null ? "connecting" : "live";
  return (
    <p
      data-state={state}
      className={clsx(
        "inline-flex items-center gap-2 text-lg font-semibold",
        state === "offline" ? "text-danger" : "text-muted",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "h-3 w-3 shrink-0 rounded-full",
          state === "offline" ? "bg-danger" : state === "live" ? "bg-success" : "bg-outline",
        )}
      />
      {state === "offline"
        ? "Bağlantı yok"
        : state === "connecting"
          ? "Bağlanıyor…"
          : `Canlı · son güncelleme ${formatTime(lastUpdateMs, WITH_SECONDS)}`}
    </p>
  );
}
