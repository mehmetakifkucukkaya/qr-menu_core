import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * IconButton — Sprint 12A primitive.
 *
 * Square button with an icon as the only visible content. Always
 * requires `ariaLabel` (no visible label means we cannot rely on the
 * DOM text for screen readers).
 *
 * Sizes (touch-target compliant):
 *   - sm — 32×32 hit-area; intended for dense toolbars.
 *   - md — 40×40; default for popovers, modals, headers.
 *   - lg — 48×48; Material HIG-grade touch target for primary mobile
 *           actions (cart-toggle, theme-toggle on touch screens).
 *
 * Variants mirror the broader Button (12D):
 *   - primary     — solid brand colour.
 *   - secondary   — solid accent.
 *   - ghost       — transparent; hovers to a soft bg.
 *   - outline     — bordered, transparent fill.
 *   - destructive — red surface; for destructive single-action menus.
 *
 * The loading flag swaps the icon for an inline spinner — the spinner
 * is intentionally simple (CSS border) to avoid pulling in a library.
 */

type IconButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "destructive";

type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonProps {
  icon: ReactNode;
  ariaLabel: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  children?: ReactNode;
  type?: "button" | "submit" | "reset";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const sizeClass: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const variantClass: Record<IconButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
  secondary:
    "bg-accent text-white hover:bg-accent/90 active:bg-accent/80",
  ghost:
    "bg-transparent text-text hover:bg-background active:bg-background/70",
  outline:
    "bg-transparent text-text border border-border hover:bg-background hover:border-primary/40",
  destructive:
    "bg-danger text-white hover:bg-danger/90 active:bg-danger/80",
};

export function IconButton({
  icon,
  ariaLabel,
  onClick,
  variant = "ghost",
  size = "md",
  children,
  type = "button",
  loading = false,
  disabled = false,
  className,
}: IconButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      disabled={isDisabled}
      className={clsx(
        "relative inline-flex items-center justify-center rounded-full",
        "transition-[background-color,color,border-color,box-shadow] duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        sizeClass[size],
        variantClass[variant],
        className,
      )}
    >
      {loading ? (
        <span
          aria-hidden
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}