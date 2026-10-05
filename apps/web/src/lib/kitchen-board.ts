/**
 * The kitchen screen's pure rules (SPEC_PILOT_READINESS 5): how old an order
 * feels, which cards are new, which button a card offers.
 *
 * No React, no fetch: everything here is a plain function so it can be unit
 * tested with Node's runner. The server is the authority on what the board
 * contains (`GET /api/v1/admin/kitchen/board`); this file only decides how it is
 * shown.
 */

export type ColumnKey = "new" | "preparing" | "ready";

export const COLUMN_KEYS: readonly ColumnKey[] = ["new", "preparing", "ready"];

export const COLUMN_TITLES: Readonly<Record<ColumnKey, string>> = {
  new: "Yeni",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
};

/** Statuses an order has while it is on the board. */
export type KitchenCardStatus = "pending" | "confirmed" | "preparing" | "ready";

export interface KitchenCardItem {
  id: number;
  name: string;
  quantity: number;
  notes: string;
  /** Turkish allergen names copied onto the line when the order was placed. */
  allergens: string[];
}

export interface KitchenCard {
  id: number;
  order_number: string;
  /** The short "#12" of the day (null on orders from before it existed). */
  daily_seq: number | null;
  status: KitchenCardStatus;
  table_number: string;
  customer_name: string;
  order_notes: string;
  placed_at: string;
  /** Seconds since the order was placed, as of the server's `server_time`. */
  age_seconds: number;
  /** Still open from an earlier local day ("dünden"). */
  is_stale: boolean;
  items: KitchenCardItem[];
}

/** `GET /api/v1/admin/kitchen/board`. Never carries the customer's phone. */
export interface KitchenBoard {
  columns: Record<ColumnKey, KitchenCard[]>;
  /** The real totals per column (the shown cards stop at 100). */
  counts: Record<ColumnKey, number>;
  truncated: boolean;
  server_time: string;
}

/** What a tap on a card's main button asks the server for. */
export type KitchenTarget = "preparing" | "ready" | "delivered";

// ------------------------------------------------------------------ naming

/** "#12", the short number of the day; orders from before it existed show their full number. */
export function cardTitle(card: Pick<KitchenCard, "daily_seq" | "order_number">): string {
  return card.daily_seq !== null ? `#${card.daily_seq}` : card.order_number;
}

/** "Masa 7", or "Masa yok" when the customer gave none. */
export function tableLabel(card: Pick<KitchenCard, "table_number">): string {
  const table = card.table_number.trim();
  return table ? `Masa ${table}` : "Masa yok";
}

// ------------------------------------------------------------------ age

export const WARN_AFTER_SECONDS = 10 * 60;
export const LATE_AFTER_SECONDS = 20 * 60;

export type AgeTone = "ok" | "warn" | "late";

/** Yellow after 10 minutes, red after 20. */
export function ageTone(seconds: number): AgeTone {
  if (seconds >= LATE_AFTER_SECONDS) return "late";
  if (seconds >= WARN_AFTER_SECONDS) return "warn";
  return "ok";
}

/** `M:SS`, or `H:MM:SS` from the first hour on. */
export function formatAge(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = String(safe % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

/** The card's age now: the server's figure plus what passed since it arrived. */
export function liveAge(
  card: { age_seconds: number },
  receivedAtMs: number,
  nowMs: number,
): number {
  return card.age_seconds + Math.max(0, Math.floor((nowMs - receivedAtMs) / 1000));
}

// ------------------------------------------------------------------ what is new

/**
 * Which cards deserve attention.
 *
 * `known` is every order id the tablet has seen (`null` until the first board
 * arrives: what was already waiting when the screen was opened is not an
 * alarm). `alerts` is the NEW cards that appeared since and that nobody has
 * touched yet: they are highlighted and keep the sound going.
 */
export interface AlertState {
  known: ReadonlySet<number> | null;
  alerts: ReadonlySet<number>;
}

export function nextAlertState(state: AlertState, board: KitchenBoard): AlertState {
  const inNew = new Set(board.columns.new.map((c) => c.id));
  const alerts = new Set<number>();
  // An alert ends when its card leaves the NEW column (started, cancelled, gone).
  for (const id of state.alerts) if (inNew.has(id)) alerts.add(id);
  if (state.known !== null) {
    for (const id of inNew) if (!state.known.has(id)) alerts.add(id);
  }
  const known = new Set(state.known ?? []);
  for (const key of COLUMN_KEYS) for (const c of board.columns[key]) known.add(c.id);
  return { known, alerts };
}

/** The cook touched these cards: they stop being new. */
export function acknowledge(state: AlertState, ids: readonly number[]): AlertState {
  const drop = new Set(ids);
  return { known: state.known, alerts: new Set([...state.alerts].filter((id) => !drop.has(id))) };
}

// ------------------------------------------------------------------ buttons

export interface PrimaryAction {
  to: KitchenTarget;
  label: string;
}

/** The one big button of a card (the cancel button is separate). */
export function primaryActionFor(status: KitchenCardStatus): PrimaryAction {
  switch (status) {
    case "pending":
    case "confirmed":
      return { to: "preparing", label: "Hazırlamaya başla" };
    case "preparing":
      return { to: "ready", label: "Hazır" };
    case "ready":
      return { to: "delivered", label: "Teslim edildi" };
  }
}

/** Open orders can be cancelled; once an order is ready the only way on is delivery. */
export function canCancel(status: KitchenCardStatus): boolean {
  return status !== "ready";
}

export type CancelReason = "out_of_stock" | "kitchen_busy" | "other";

/** What the server accepts as `cancel_reason`, and what the cook and the customer read. */
export const CANCEL_REASONS: ReadonlyArray<{ value: CancelReason; label: string }> = [
  { value: "out_of_stock", label: "Ürün tükendi" },
  { value: "kitchen_busy", label: "Mutfak yoğun" },
  { value: "other", label: "Diğer" },
];

export function cancelReasonLabel(reason: string | null | undefined): string | null {
  return CANCEL_REASONS.find((r) => r.value === reason)?.label ?? null;
}
