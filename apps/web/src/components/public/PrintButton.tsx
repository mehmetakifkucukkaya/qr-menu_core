"use client";

import { Printer } from "lucide-react";

interface PrintButtonProps {
  /** Optional accessible label override (default: "🖨️ Yazdır"). */
  label?: string;
  /** When provided, navigates to this URL on click instead of
   *  calling window.print() directly. Useful for the "Open
   *  print-friendly view" affordance — operators on a kiosk tablet
   *  can preview before printing. */
  href?: string;
  className?: string;
}

/**
 * PrintButton — Sprint D2 (frontend export).
 *
 * Renders a single button that opens the browser print dialog
 * (`window.print()`). The @media print rules in
 * `styles/print.css` strip all chrome (sticky header, footer, cart
 * FAB, UpgradeBanner, drawers) so the printed output is a clean
 * menu page.
 *
 * Visibility rules:
 *   - Hidden when the device viewport is < 768px (Tailwind `md`).
 *     Phones have no real print path — calling window.print() on a
 *     mobile browser opens the share sheet, not a printer dialog,
 *     which confuses the customer. Mobile users see the button only
 *     on tablets (≥ md). Below md the button stays in the DOM but is
 *     `hidden` — same a11y label so screen readers still announce it
 *     if the user resizes the window.
 *
 * Markup stays intentionally simple — no Sprint 12A Button primitive
 * wrapper because the print interaction is a single, one-line
 * `window.print()` call. Lifting it into the primitive would force a
 * forwarding ref pattern that adds no value here.
 *
 * `className="print-button"` is the print-time hidden hook used by
 * `styles/print.css` (the button disappears in the printed output so
 * it doesn't render as a stray 🖨️ pill on the page).
 */
export function PrintButton({
  label = "🖨️ Yazdır",
  href,
  className,
}: PrintButtonProps) {
  const baseClass =
    "print-button hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-text shadow-sm transition hover:bg-background hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  if (href) {
    return (
      <a
        href={href}
        className={`${baseClass}${className ? ` ${className}` : ""}`}
        aria-label="Yazdırılabilir menüyü aç"
      >
        <Printer className="h-3.5 w-3.5" aria-hidden />
        <span>{label}</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.print();
        }
      }}
      className={`${baseClass}${className ? ` ${className}` : ""}`}
      aria-label="Menüyü yazdır"
    >
      <Printer className="h-3.5 w-3.5" aria-hidden />
      <span>{label}</span>
    </button>
  );
}