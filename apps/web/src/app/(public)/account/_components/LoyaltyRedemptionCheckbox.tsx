"use client";

/**
 * LoyaltyRedemptionCheckbox — Sprint 10B (D-025).
 *
 * Embeds into the public CheckoutForm. Lets the customer toggle whether
 * to redeem puan against the current order. Server-side validation is
 * the source of truth (balance + min threshold + order total) — we
 * only mirror the UX here.
 *
 * Rules:
 *  - `enabled = balance >= min_points_to_redeem`; below threshold the
 *    section is muted and the checkbox is disabled with a copy hint.
 *  - User picks any integer in `[min_points_to_redeem, balance]`.
 *  - Real-time discount = `points * redemption_rate`.
 */

import { useId, useMemo, useState } from "react";
import { Crown } from "lucide-react";

import type { PublicLoyaltySettings } from "@/types/account";

interface LoyaltyRedemptionCheckboxProps {
  balance: number;
  settings: PublicLoyaltySettings;
  /** Called whenever the user toggles the checkbox or edits the points. */
  onChange: (next: {
    enabled: boolean;
    points: number;
    discountAmount: string;
  }) => void;
  /** Localised currency code — affects only the label tone (no math). */
  currency?: string;
}

function formatMoney(amount: number, currency: string): string {
  try {
    if (currency.toUpperCase() === "TRY") {
      return new Intl.NumberFormat("tr-TR", {
        style: "currency",
        currency: "TRY",
        minimumFractionDigits: 2,
      }).format(amount);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function LoyaltyRedemptionCheckbox({
  balance,
  settings,
  onChange,
  currency = "TRY",
}: LoyaltyRedemptionCheckboxProps) {
  const minPoints = settings.min_points_to_redeem;
  const maxPoints = Math.max(balance, minPoints);
  const enabled = balance >= minPoints && minPoints > 0;
  const id = useId();

  const initialPoints = enabled ? minPoints : 0;
  const [points, setPoints] = useState<number>(initialPoints);
  const [checked, setChecked] = useState(false);

  const rate = useMemo(() => {
    const r = Number.parseFloat(settings.redemption_rate);
    return Number.isFinite(r) ? r : 0;
  }, [settings.redemption_rate]);

  const discount = useMemo(() => {
    const value = points * rate;
    return (Math.floor(value * 100) / 100).toFixed(2);
  }, [points, rate]);

  const handleToggle = (next: boolean) => {
    setChecked(next);
    const newPoints = next && enabled ? Math.max(points, minPoints) : 0;
    const newDiscount = next ? (Math.floor(newPoints * rate * 100) / 100).toFixed(2) : "0.00";
    onChange({
      enabled: next && enabled,
      points: newPoints,
      discountAmount: newDiscount,
    });
  };

  const handlePointsChange = (raw: string) => {
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) {
      setPoints(0);
      onChange({ enabled: false, points: 0, discountAmount: "0.00" });
      return;
    }
    const clamped = Math.min(Math.max(n, 0), balance);
    setPoints(clamped);
    const discountAmount = (Math.floor(clamped * rate * 100) / 100).toFixed(2);
    onChange({ enabled: clamped > 0 && enabled, points: clamped, discountAmount });
  };

  return (
    <section
      aria-label="Sadakat puanı kullan"
      className={`rounded-lg border p-3 transition ${
        enabled
          ? "border-amber-200 bg-amber-50"
          : "border-border bg-background"
      }`}
    >
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={!enabled}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-600" aria-hidden />
            <span className="text-sm font-semibold text-text">
              Sadakat puanı kullan
            </span>
            <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-amber-800 ring-1 ring-amber-200">
              {balance.toLocaleString("tr-TR")} puan
            </span>
          </div>
          {enabled ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={minPoints}
                  max={balance}
                  step={1}
                  value={points}
                  onChange={(e) => handlePointsChange(e.target.value)}
                  disabled={!checked}
                  className="w-24 rounded-md border border-border bg-surface px-2 py-1.5 text-sm tabular-nums text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Kullanılacak puan miktarı"
                />
                <span className="text-xs text-muted">puan</span>
                <span className="ml-auto text-xs font-semibold text-emerald-700 tabular-nums">
                  {formatMoney(Number.parseFloat(discount), currency)} indirim
                </span>
              </div>
              <p className="text-[11px] text-muted">
                {minPoints} ile {balance.toLocaleString("tr-TR")} puan arasında
                kullanabilirsiniz.
              </p>
              {checked ? (
                <p className="text-[11px] font-medium text-amber-800">
                  Ödeme tutarından {formatMoney(Number.parseFloat(discount), currency)}{" "}
                  düşülecek.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">
              {minPoints.toLocaleString("tr-TR")}+ puana ulaştığınızda
              indirim olarak kullanabilirsiniz.
            </p>
          )}
        </div>
      </label>
    </section>
  );
}
