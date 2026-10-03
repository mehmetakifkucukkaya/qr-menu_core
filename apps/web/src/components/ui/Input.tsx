import clsx from "clsx";
import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Input / Textarea — the form-control styling every form should share.
 *
 * - 48 px tall and 16 px text: comfortable to tap and it stops iOS Safari from
 *   zooming the page on focus (anything under 16 px triggers that zoom).
 * - The border uses the `input` token (3.75:1 on the page background) so the
 *   field's boundary meets WCAG 1.4.11 — the decorative `border` hairline is
 *   only 1.2:1 and must not be used to outline a control.
 * - Focus is a soft brand halo instead of the browser outline; an invalid field
 *   (aria-invalid="true") turns the border and halo red.
 */
export const inputStyles =
  "w-full rounded-xl border border-input bg-surface px-4 text-base text-text " +
  "placeholder:text-outline transition-[border-color,box-shadow] duration-200 " +
  "hover:border-muted focus-visible:border-primary focus-visible:outline-none " +
  "focus-visible:ring-4 focus-visible:ring-primary/15 " +
  "disabled:cursor-not-allowed disabled:bg-surface-low disabled:text-outline " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/15";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * comfortable — 48 px, always 16 px text (public checkout, sign-up)
   * compact     — 44 px, 16 px text on phones and 14 px from `sm` (admin forms)
   * Heights live here, not in `className`: two competing `h-*` classes on one
   * element are resolved by stylesheet order, not by the order they are written.
   */
  density?: "comfortable" | "compact";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, density = "comfortable", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        inputStyles,
        density === "comfortable" ? "h-12" : "h-11 sm:text-sm",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={clsx(inputStyles, "min-h-[5.5rem] resize-y py-3", className)}
      {...rest}
    />
  );
});
