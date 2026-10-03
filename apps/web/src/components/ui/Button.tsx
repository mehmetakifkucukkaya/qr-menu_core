import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Button — the one place button geometry, colour and states are defined.
 *
 * Variants
 *   primary   solid brand colour — the single main action of a view
 *   secondary solid terracotta — a warm highlight (use sparingly)
 *   soft      tinted brand fill — quiet but clearly a button
 *   outline   bordered, transparent — secondary actions
 *   ghost     text only — tertiary / toolbar actions
 *   danger    destructive actions (delete, cancel order)
 *   danger-soft  quiet destructive action (remove a photo) — tinted, not solid
 *   inverse   translucent white — for use ON a primary-coloured surface (banners)
 *   floating  frosted surface chip — a close button over a photograph
 *
 * Sizes keep the 44 px touch target on md and up; `sm` (36 px) is for dense
 * admin toolbars and must not be the only way to reach an action on a phone.
 *
 * Need a link that looks like a button (Next `<Link>`, `<a>`)? Don't wrap a
 * button in a link: call `buttonStyles({ variant, size })` and put the string
 * on the anchor.
 *
 * Don't override a variant's colours through `className`: two competing
 * `text-*` / `bg-*` classes are resolved by stylesheet order, not by the order
 * they are written. Add a variant instead (that is why `inverse` exists).
 * The same goes for `position`: a Button is always `relative`, so `absolute`
 * in `className` silently loses. Put the Button in a positioned wrapper.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-soft"
  | "inverse"
  | "floating";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-semibold " +
  "transition-[background-color,color,border-color,box-shadow,transform] duration-200 ease-out-expo " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 " +
  "aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
  secondary:
    "bg-secondary text-white shadow-sm hover:bg-secondary/90 hover:shadow-md",
  soft: "bg-primary-soft text-primary hover:bg-primary/15",
  outline:
    "border border-border-strong bg-surface text-text hover:bg-surface-low hover:border-input",
  ghost: "text-text hover:bg-surface-low",
  danger: "bg-danger text-white shadow-sm hover:bg-danger/90",
  "danger-soft": "bg-danger-soft text-danger hover:bg-danger/15",
  inverse: "bg-white/15 text-primary-foreground hover:bg-white/25",
  floating: "bg-surface/90 text-text shadow-md backdrop-blur hover:bg-surface",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 rounded-xl px-3.5 text-sm",
  md: "h-11 rounded-xl px-5 text-[0.9375rem]",
  lg: "h-12 rounded-2xl px-6 text-base",
  icon: "h-11 w-11 rounded-full",
  "icon-sm": "h-9 w-9 rounded-full",
};

interface StyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class string for anything that must look like a Button (anchors, links). */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: StyleOptions = {}): string {
  return clsx(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    Omit<StyleOptions, "className"> {
  /** Shows a spinner, disables the button and sets aria-busy. */
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    fullWidth,
    loading = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading ? trailingIcon : null}
    </button>
  );
});
