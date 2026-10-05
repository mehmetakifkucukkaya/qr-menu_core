"use client";

import { useCallback, useEffect, useState } from "react";

import { AdminApiError, fetchCsrfToken, fetchKitchenBoard, updateOrderStatus } from "@/lib/api-admin";
import {
  acknowledge,
  COLUMN_KEYS,
  COLUMN_TITLES,
  liveAge,
  nextAlertState,
  type AlertState,
  type CancelReason,
  type ColumnKey,
  type KitchenBoard as KitchenBoardData,
  type KitchenCard as KitchenCardData,
  type KitchenTarget,
} from "@/lib/kitchen-board";
import { useBoardPolling } from "@/lib/use-board-polling";

import { CancelDialog } from "./CancelDialog";
import { ConnectionBanner } from "./ConnectionBanner";
import { KitchenCard } from "./KitchenCard";
import { LiveStatus } from "./LiveStatus";
import { ServiceControls } from "./ServiceControls";

export interface KitchenBoardProps {
  /** The board the server drew; `null` when it could not (the screen then loads it itself). */
  initialBoard: KitchenBoardData | null;
  /** The signed-in session's CSRF token, for the status changes. */
  csrfToken: string | null;
}

/** The colour on top of a column says what stage it is. */
const COLUMN_ACCENT: Record<ColumnKey, string> = {
  new: "border-warning",
  preparing: "border-primary",
  ready: "border-success",
};

function fetchBoard(signal: AbortSignal): Promise<KitchenBoardData> {
  return fetchKitchenBoard({ signal });
}

/** The browser's clock, once a second; `null` until the page is alive (the server cannot know it). */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function without<T>(record: Record<number, T>, id: number): Record<number, T> {
  const rest = { ...record };
  delete rest[id];
  return rest;
}

function problemOf(error: unknown): string {
  if (error instanceof AdminApiError) {
    return error.status === 0 ? "Bağlantı kurulamadı. Tekrar deneyin." : error.message;
  }
  return "İşlem yapılamadı. Tekrar deneyin.";
}

/**
 * The kitchen screen (SPEC_PILOT_READINESS 5): three columns, refreshed every
 * 5 seconds from `GET /api/v1/admin/kitchen/board`. A new order rings the bell
 * (once "Servisi başlat" was tapped) until somebody touches its card; when the
 * connection drops the last good orders stay and a strip says so.
 */
export function KitchenBoard({ initialBoard, csrfToken }: KitchenBoardProps) {
  const polling = useBoardPolling<KitchenBoardData>({ fetchBoard, initialData: initialBoard });
  const now = useNow();
  const [alerts, setAlerts] = useState<AlertState>({ known: null, alerts: new Set() });
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const [problems, setProblems] = useState<Record<number, string>>({});
  const [cancelling, setCancelling] = useState<KitchenCardData | null>(null);

  const board = polling.data;
  const { refreshNow } = polling;

  useEffect(() => {
    if (board) setAlerts((previous) => nextAlertState(previous, board));
  }, [board]);

  const touch = useCallback((card: KitchenCardData) => {
    setAlerts((previous) => (previous.alerts.has(card.id) ? acknowledge(previous, [card.id]) : previous));
  }, []);

  const send = useCallback(
    async (card: KitchenCardData, status: KitchenTarget | "cancelled", cancelReason?: CancelReason) => {
      setProblems((current) => without(current, card.id));
      setBusy((current) => new Set(current).add(card.id));
      try {
        const token = csrfToken ?? (await fetchCsrfToken());
        await updateOrderStatus(card.id, status, { csrfToken: token, cancelReason });
        refreshNow();
      } catch (error) {
        setProblems((current) => ({ ...current, [card.id]: problemOf(error) }));
        // The server answered (somebody moved the order first, or it is gone): show the truth.
        if (error instanceof AdminApiError && error.status !== 0) refreshNow();
      } finally {
        setBusy((current) => {
          const next = new Set(current);
          next.delete(card.id);
          return next;
        });
      }
    },
    [csrfToken, refreshNow],
  );

  function confirmCancel(reason: CancelReason) {
    if (!cancelling) return;
    const card = cancelling;
    setCancelling(null);
    void send(card, "cancelled", reason);
  }

  const ageOf = (card: KitchenCardData) =>
    now === null || polling.receivedAtMs === null
      ? card.age_seconds
      : liveAge(card, polling.receivedAtMs, now);
  const sessionEnded =
    polling.failures > 0 &&
    polling.lastError instanceof AdminApiError &&
    (polling.lastError.status === 401 || polling.lastError.status === 403);

  return (
    <div className="kitchen-dark flex flex-col gap-4 rounded-3xl bg-background p-4 text-text sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mutfak Ekranı</h1>
          <div className="mt-1">
            <LiveStatus failures={polling.failures} lastUpdateMs={polling.lastSuccessAtMs} />
          </div>
        </div>
        <ServiceControls alertActive={alerts.alerts.size > 0} />
      </header>

      <ConnectionBanner
        failures={polling.failures}
        lastUpdateMs={polling.lastSuccessAtMs}
        sessionEnded={sessionEnded}
      />

      {board === null ? (
        <p className="py-16 text-center text-2xl text-muted">Siparişler yükleniyor…</p>
      ) : (
        <>
          {board.truncated ? (
            <p className="rounded-2xl border-2 border-warning bg-warning-soft px-4 py-3 text-lg font-semibold text-warning">
              Yalnızca en eski {COLUMN_KEYS.reduce((n, key) => n + board.columns[key].length, 0)} sipariş
              gösteriliyor (toplam {COLUMN_KEYS.reduce((n, key) => n + board.counts[key], 0)}).
            </p>
          ) : null}
          <div className="grid items-start gap-4 lg:grid-cols-3">
            {COLUMN_KEYS.map((key) => (
              <section
                key={key}
                aria-label={COLUMN_TITLES[key]}
                className={`flex min-w-0 flex-col gap-3 rounded-2xl border-t-4 bg-surface-low p-3 ${COLUMN_ACCENT[key]}`}
              >
                <h2 className="flex items-center justify-between gap-3 px-1 text-2xl font-bold">
                  <span>{COLUMN_TITLES[key]}</span>
                  <span className="rounded-full bg-surface-high px-4 py-0.5 text-xl tabular-nums">
                    {board.counts[key]}
                  </span>
                </h2>
                {board.columns[key].length === 0 ? (
                  <p className="rounded-2xl border-2 border-dashed border-border-strong px-4 py-8 text-center text-lg text-muted">
                    Sipariş yok
                  </p>
                ) : (
                  board.columns[key].map((card) => (
                    <KitchenCard
                      key={card.id}
                      card={card}
                      ageSeconds={ageOf(card)}
                      isNew={alerts.alerts.has(card.id)}
                      busy={busy.has(card.id)}
                      error={problems[card.id] ?? null}
                      onTouch={touch}
                      onAdvance={(target, to) => void send(target, to)}
                      onCancel={setCancelling}
                    />
                  ))
                )}
              </section>
            ))}
          </div>
        </>
      )}

      <CancelDialog card={cancelling} onConfirm={confirmCancel} onClose={() => setCancelling(null)} />
    </div>
  );
}
