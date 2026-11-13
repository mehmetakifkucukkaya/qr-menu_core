"use client";

import { useEffect, useState } from "react";

import { formatTime } from "@/lib/datetime";

/**
 * The venue's time (HH:MM) in the kitchen frame. Blank until the page is alive:
 * the server's clock and the tablet's would disagree, and the first render must
 * match the server's.
 */
export function KitchenClock() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) return <span aria-hidden className="inline-block min-w-[4.5rem]" />;
  return (
    <time dateTime={new Date(now).toISOString()} className="text-2xl font-bold tabular-nums text-text">
      {formatTime(now)}
    </time>
  );
}
