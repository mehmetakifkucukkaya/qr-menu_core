"use client";

import { useEffect, useRef, useState } from "react";

import {
  CANCEL_REASONS,
  cardTitle,
  tableLabel,
  type CancelReason,
  type CancelTarget,
} from "@/lib/kitchen-board";

export interface CancelDialogProps {
  /** The order being cancelled; `null` keeps the dialog closed. */
  card: CancelTarget | null;
  onConfirm: (reason: CancelReason) => void;
  onClose: () => void;
}

/**
 * Cancelling asks for a reason (out of stock, kitchen busy, other); the customer
 * reads it on the order page. A native `<dialog>`: the browser traps the focus,
 * closes it on Escape and dims what is behind it.
 */
export function CancelDialog({ card, onConfirm, onClose }: CancelDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (card && !dialog.open) {
      // Browsers without <dialog> modals still get a visible dialog.
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!card && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [card]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="kitchen-cancel-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the dimmed backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-3xl border-2 border-border-strong bg-surface p-0 text-text backdrop:bg-black/70"
    >
      {card ? <CancelForm key={card.id} card={card} onConfirm={onConfirm} onClose={onClose} /> : null}
    </dialog>
  );
}

function CancelForm({
  card,
  onConfirm,
  onClose,
}: {
  card: CancelTarget;
  onConfirm: (reason: CancelReason) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<CancelReason | null>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (reason) onConfirm(reason);
      }}
      className="flex flex-col gap-4 p-6"
    >
      <div>
        <h2 id="kitchen-cancel-title" className="text-2xl font-bold">
          Siparişi iptal et
        </h2>
        <p className="mt-2 text-lg text-muted">
          {cardTitle(card)} · {tableLabel(card)}
        </p>
        <p className="mt-1 text-lg text-muted">
          İptal nedenini seçin; müşteri bu nedeni sipariş sayfasında görür.
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">İptal nedeni</legend>
        {CANCEL_REASONS.map(({ value, label }) => (
          <label
            key={value}
            className="flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border-2 border-input px-4 text-xl font-semibold has-[:checked]:border-danger has-[:checked]:bg-danger-soft"
          >
            <input
              type="radio"
              name="cancel-reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="h-6 w-6 accent-danger"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-14 flex-1 rounded-xl border-2 border-input px-4 text-xl font-bold"
        >
          Vazgeç
        </button>
        <button
          type="submit"
          disabled={reason === null}
          className="min-h-14 flex-1 rounded-xl bg-danger px-4 text-xl font-bold text-background disabled:opacity-40"
        >
          Siparişi iptal et
        </button>
      </div>
    </form>
  );
}
