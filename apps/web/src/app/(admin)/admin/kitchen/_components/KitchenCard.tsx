"use client";

import clsx from "clsx";
import { Clock, Loader2, TriangleAlert } from "lucide-react";

import {
  ageTone,
  canCancel,
  cardTitle,
  formatAge,
  primaryActionFor,
  tableLabel,
  type AgeTone,
  type KitchenCard as KitchenCardData,
  type KitchenCardStatus,
  type KitchenTarget,
} from "@/lib/kitchen-board";

export interface KitchenCardProps {
  card: KitchenCardData;
  /** The order's age now, in seconds (the board counts it up every second). */
  ageSeconds: number;
  /** New and not touched yet: highlighted, and the bell rings for it. */
  isNew: boolean;
  /** A request for this order is on its way: the buttons stay off. */
  busy: boolean;
  /** What the server answered when the last tap was refused. */
  error: string | null;
  /** Any touch on the card (it is no longer new). */
  onTouch: (card: KitchenCardData) => void;
  onAdvance: (card: KitchenCardData, to: KitchenTarget) => void;
  onCancel: (card: KitchenCardData) => void;
}

/** The colour of the one big button says which step it is (new / preparing / ready). */
const PRIMARY_CLASS: Record<KitchenCardStatus, string> = {
  pending: "bg-warning text-background",
  confirmed: "bg-warning text-background",
  preparing: "bg-primary text-primary-foreground",
  ready: "bg-success text-background",
};

const AGE_CLASS: Record<AgeTone, string> = {
  ok: "text-muted",
  warn: "text-warning",
  late: "text-danger",
};

/** Colour is never the only signal: a late order says so in words as well. */
const AGE_WORDS: Record<AgeTone, string> = { ok: "", warn: "Uzadı: ", late: "Geç kaldı: " };

/**
 * One order on the kitchen screen: the number and table large enough to read from
 * a metre away, the lines with their notes and allergens, and the one button the
 * order needs next. Text is at least 16 px and every button at least 48 px tall
 * (SPEC_PILOT_READINESS 5.5). The customer's phone number is not on it.
 */
export function KitchenCard({
  card,
  ageSeconds,
  isNew,
  busy,
  error,
  onTouch,
  onAdvance,
  onCancel,
}: KitchenCardProps) {
  const action = primaryActionFor(card.status);
  const tone = ageTone(ageSeconds);

  return (
    <article
      aria-label={`Sipariş ${cardTitle(card)}, ${tableLabel(card)}`}
      data-alert={isNew ? "true" : "false"}
      data-status={card.status}
      onClick={() => onTouch(card)}
      className={clsx(
        "flex flex-col gap-3 rounded-2xl border-2 bg-surface p-4",
        isNew ? "kitchen-card-alert border-warning" : "border-border",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-4xl font-black leading-none tabular-nums text-text">{cardTitle(card)}</p>
          <p className="mt-2 break-words text-base text-muted">
            {card.order_number}
            {card.customer_name ? ` · ${card.customer_name}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-3xl font-bold leading-none text-text">{tableLabel(card)}</p>
          <p
            data-tone={tone}
            className={clsx(
              "mt-2 inline-flex items-center justify-end gap-1.5 text-xl font-bold tabular-nums",
              AGE_CLASS[tone],
            )}
          >
            <Clock className="h-5 w-5" aria-hidden />
            <span>
              {AGE_WORDS[tone]}
              {formatAge(ageSeconds)}
            </span>
          </p>
        </div>
      </header>

      {isNew || card.is_stale ? (
        <p className="flex flex-wrap gap-2">
          {isNew ? (
            <span className="rounded-full bg-warning px-3 py-0.5 text-base font-black tracking-wide text-background">
              YENİ
            </span>
          ) : null}
          {card.is_stale ? (
            <span className="rounded-full border-2 border-secondary px-3 py-0.5 text-base font-bold text-secondary">
              Dünden
            </span>
          ) : null}
        </p>
      ) : null}

      <ul className="space-y-3 border-t-2 border-border pt-3">
        {card.items.map((item) => (
          <li key={item.id}>
            <p className="flex items-baseline gap-3 text-xl font-semibold text-text">
              <span className="min-w-[3.25rem] shrink-0 rounded-lg bg-primary-soft px-2 py-0.5 text-center font-bold tabular-nums text-primary">
                {item.quantity}×
              </span>
              <span className="min-w-0 break-words">{item.name}</span>
            </p>
            {item.allergens.length > 0 ? (
              <ul className="ml-[4.25rem] mt-1.5 flex flex-wrap gap-2" aria-label="Alerjenler">
                {item.allergens.map((allergen) => (
                  <li
                    key={allergen}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-warning bg-warning-soft px-3 py-0.5 text-base font-bold text-warning"
                  >
                    <TriangleAlert className="h-4 w-4" aria-hidden />
                    {allergen}
                  </li>
                ))}
              </ul>
            ) : null}
            {item.notes ? (
              <p className="ml-[4.25rem] mt-1.5 break-words rounded-lg bg-warning-soft px-3 py-1.5 text-lg font-semibold text-warning">
                {item.notes}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {card.order_notes ? (
        <p className="break-words rounded-lg border-2 border-dashed border-border-strong px-3 py-2 text-lg text-text">
          <span className="font-bold">Sipariş notu: </span>
          {card.order_notes}
        </p>
      ) : null}

      <footer className="mt-auto flex flex-col gap-2 pt-1">
        <button
          type="button"
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={() => onAdvance(card, action.to)}
          className={clsx(
            "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-xl font-bold transition active:scale-[0.98] disabled:opacity-60",
            PRIMARY_CLASS[card.status],
          )}
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> : null}
          {action.label}
        </button>
        {canCancel(card.status) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(card)}
            className="min-h-12 w-full rounded-xl border-2 border-danger px-4 text-lg font-semibold text-danger transition active:scale-[0.98] disabled:opacity-60"
          >
            İptal
          </button>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border-2 border-danger bg-danger-soft px-3 py-2 text-base font-semibold text-danger"
          >
            {error}
          </p>
        ) : null}
      </footer>
    </article>
  );
}
