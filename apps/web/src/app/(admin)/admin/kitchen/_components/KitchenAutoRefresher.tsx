"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface KitchenAutoRefresherProps {
  /** How often to call `router.refresh()` (in ms). */
  intervalMs: number;
}

/**
 * KitchenAutoRefresher — invisible polling owner for the kitchen display.
 *
 * Renders nothing. Its only job is to call `router.refresh()` every
 * `intervalMs` milliseconds so the parent server component re-fetches
 * `fetchKitchenTickets()` and re-renders the grid.
 *
 * Why polling rather than SSE/WebSocket?
 *   - Keeps the backend simple (already documented as the polling model
 *     in DECISIONS.md OP-20 and Sprint 8 plan).
 *   - 10 s is fine for kitchen operations — operators are physically at
 *     the screen and see the pulse animation immediately.
 */
export function KitchenAutoRefresher({ intervalMs }: KitchenAutoRefresherProps) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
