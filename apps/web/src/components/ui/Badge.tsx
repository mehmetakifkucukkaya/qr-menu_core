import clsx from "clsx";
import type { HTMLAttributes, ReactNode } from "react";

/**
 * Badge — small status / attribute label.
 *
 * Tones map to semantic tokens, so a badge can be read without colour alone
 * (always pair a status tone with a word or an icon). Text is ≥ 12 px and sits
 * on a soft fill that keeps ≥ 4.5:1 contrast in both themes.
 *
 *   neutral   plain attribute (calories, allergen count)
 *   primary   brand highlight (signature dish, selected)
 *   warm      terracotta highlight (popular, new)
 *   success / warning / danger   real status
 *   solid     inverted — only on top of photographs
 */

export type BadgeTone =
  | "neutral"
  | "primary"
  | "warm"
  | "success"
  | "warning"
  | "danger"
  | "solid";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-surface-low text-muted ring-1 ring-inset ring-border",
  primary: "bg-primary-soft text-primary",
  warm: "bg-secondary-soft text-secondary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  solid: "bg-primary text-primary-foreground shadow-sm",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** sm 24 px (cards, dense lists) · md 28 px (detail sheets). */
  size?: "sm" | "md";
  icon?: ReactNode;
}

export function Badge({
  tone = "neutral",
  size = "sm",
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 text-xs font-semibold leading-none",
        size === "sm" ? "h-6" : "h-7",
        tones[tone],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </span>
  );
}
