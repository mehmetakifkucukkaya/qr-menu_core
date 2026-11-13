/**
 * React wrapper around `BoardPoller` (SPEC_PILOT_READINESS 5.5): a board that
 * refreshes itself every few seconds, keeps the last good data when a poll
 * fails, and asks for fresh data at once when the device comes back online or
 * the tab becomes visible again. The timing rules live (and are unit tested) in
 * `board-poller.ts`; this file only connects them to React.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { BoardPoller } from "./board-poller";

export interface BoardPollingOptions<T> {
  fetchBoard: (signal: AbortSignal) => Promise<T>;
  /** What the server rendered; shown until the first poll answers. */
  initialData?: T | null;
  intervalMs?: number;
  timeoutMs?: number;
}

export interface BoardPolling<T> {
  /** The newest board, or `null` when there never was one. */
  data: T | null;
  /** The browser's clock (ms) when `data` arrived; `null` for the server-rendered board before the page came alive. */
  receivedAtMs: number | null;
  /** When the last poll succeeded (browser clock, ms). */
  lastSuccessAtMs: number | null;
  /** Polls that failed in a row; 0 means healthy. `data` is still the last good board. */
  failures: number;
  /** The last failure, so a dead session can be told from a dead network. */
  lastError: unknown;
  /** Fetch now instead of waiting for the next tick. */
  refreshNow: () => void;
}

type State<T> = Omit<BoardPolling<T>, "refreshNow">;

export function useBoardPolling<T>({
  fetchBoard,
  initialData = null,
  intervalMs,
  timeoutMs,
}: BoardPollingOptions<T>): BoardPolling<T> {
  const [state, setState] = useState<State<T>>({
    data: initialData,
    receivedAtMs: null,
    lastSuccessAtMs: null,
    failures: 0,
    lastError: null,
  });
  const latestFetch = useRef(fetchBoard);
  const poller = useRef<BoardPoller<T> | null>(null);

  useEffect(() => {
    latestFetch.current = fetchBoard;
  });

  useEffect(() => {
    // The board the server drew counts as received the moment the page comes alive.
    const mountedAt = Date.now();
    setState((s) =>
      s.data !== null && s.receivedAtMs === null
        ? { ...s, receivedAtMs: mountedAt, lastSuccessAtMs: mountedAt }
        : s,
    );

    const loop = new BoardPoller<T>({
      fetchBoard: (signal) => latestFetch.current(signal),
      onData: (data, receivedAtMs) =>
        setState({ data, receivedAtMs, lastSuccessAtMs: receivedAtMs, failures: 0, lastError: null }),
      onError: (error, failures) => setState((s) => ({ ...s, failures, lastError: error })),
      intervalMs,
      timeoutMs,
    });
    poller.current = loop;
    loop.start();

    const refresh = () => loop.refreshNow();
    const onVisibility = () => {
      if (document.visibilityState === "visible") loop.refreshNow();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      loop.stop();
      poller.current = null;
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, timeoutMs]);

  const refreshNow = useCallback(() => poller.current?.refreshNow(), []);

  return { ...state, refreshNow };
}
