import clsx from "clsx";
import {
  type HTMLAttributes,
  type ReactNode,
} from "react";

/**
 * Card — Sprint 12A primitive.
 *
 * Three variants:
 *   - default — solid surface, light shadow (xs/sm), border.
 *   - glass   — translucent + backdrop-blur; intended for overlays
 *               layered over photos or gradients (admin nav, modals).
 *   - outline — border only, no fill, no shadow (sparse data lists).
 *
 * The interactive flag promotes the card to a focusable button-like
 * surface with a hover-shadow upgrade (no scale transform — anti-pattern
 * per the design-system guard rails).
 *
 * Companion components (`CardHeader`, `CardTitle`, `CardDescription`,
 * `CardContent`, `CardFooter`) follow the shadcn/DaisyUI mental model
 * so callers can compose cards without bespoke layouts.
 */

type CardVariant = "default" | "glass" | "outline";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  interactive?: boolean;
  children?: ReactNode;
}

const variantClass: Record<CardVariant, string> = {
  default: "bg-surface border border-border shadow-sm",
  glass: "surface-overlay border border-border/40 shadow-md",
  outline: "border border-border bg-transparent",
};

export function Card({
  variant = "default",
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl p-5",
        variantClass[variant],
        interactive &&
          "cursor-pointer transition-shadow duration-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("mb-4 flex items-start justify-between gap-3", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={clsx(
        "font-heading text-lg font-semibold leading-tight text-text",
        className,
      )}
      {...rest}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={clsx("mt-1 text-sm text-muted", className)} {...rest}>
      {children}
    </p>
  );
}

export function CardContent({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx("text-sm text-text", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "mt-4 flex items-center justify-between gap-3 border-t border-border pt-4",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}