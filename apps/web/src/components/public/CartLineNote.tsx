"use client";

import { useId } from "react";

import { MAX_LINE_NOTE_LENGTH } from "@/lib/cart-store";

export interface CartLineNoteProps {
  /** The dish the note is for; it names the field for screen readers. */
  itemName: string;
  value: string;
  onChange: (note: string) => void;
}

/**
 * The optional note for one line of the cart ("şekersiz", "soğansız"). It is
 * sent with the order and printed on the kitchen card under that dish.
 */
export function CartLineNote({ itemName, value, onChange }: CartLineNoteProps) {
  const counterId = useId();
  const nearLimit = value.length >= MAX_LINE_NOTE_LENGTH - 20;

  return (
    <div className="mt-2">
      <label className="block">
        <span className="sr-only">{itemName} için not</span>
        <input
          type="text"
          value={value}
          maxLength={MAX_LINE_NOTE_LENGTH}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ürüne not (ör. şekersiz)"
          aria-describedby={nearLimit ? counterId : undefined}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-base text-text placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </label>
      {nearLimit ? (
        <span id={counterId} className="mt-1 block text-right text-xs tabular-nums text-muted">
          {value.length}/{MAX_LINE_NOTE_LENGTH}
        </span>
      ) : null}
    </div>
  );
}
