"use client";

/**
 * LoyaltyBadge — Sprint 10B (D-025).
 *
 * Compact, header-friendly puan badge with a Crown icon and the
 * current balance. Two sizes:
 *   - "sm": header inline chip (12px text, fits next to the cart icon)
 *   - "md": checkout summary row (14px text, more padding)
 *
 * Disabled when `points === 0` — we still render the chip but with a
 * muted appearance so the header gives a hint that loyalty exists.
 */

import { Crown } from "lucide-react";

interface LoyaltyBadgeProps {
  points: number;
  size?: "sm" | "md";
  /** Optional click handler; when omitted the badge is a static span. */
  onClick?: () => void;
  /** Override the label (default = "puan"). */
  label?: string;
}

export function LoyaltyBadge({
  points,
  size = "sm",
  onClick,
  label = "puan",
}: LoyaltyBadgeProps) {
  const hasPoints = points > 0;
  const sizing =
    size === "md"
      ? "px-2.5 py-1 text-sm gap-1.5"
      : "px-2 py-0.5 text-xs gap-1";

  const tone = hasPoints
    ? "bg-amber-100 text-amber-800 ring-amber-200 hover:bg-amber-200"
    : "bg-muted/10 text-muted ring-border";

  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-label={`Sadakat puanı: ${points} ${label}`}
      className={`inline-flex items-center rounded-full font-semibold tabular-nums ring-1 transition focus:outline-none focus:ring-2 focus:ring-primary ${sizing} ${tone}`}
    >
      <Crown className={size === "md" ? "h-4 w-4" : "h-3 w-3"} aria-hidden />
      <span>
        {hasPoints ? points.toLocaleString("tr-TR") : "0"} {label}
      </span>
    </Tag>
  );
}
