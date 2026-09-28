import clsx from "clsx";

/**
 * KbdHint — Sprint 12A primitive.
 *
 * Inline keyboard-shortcut indicator (⌘K style — Notion / Linear /
 * Raycast pattern). Renders a list of keycap-shaped chips with
 * optional label, designed to sit next to an action label:
 *
 *     <button>Arama <KbdHint keys={["⌘", "K"]} /></button>
 *
 * Two surface variants:
 *   - `light` — solid muted background; default for surfaces on dark
 *               cards or for screenshots where contrast matters.
 *   - `dark`  — transparent with border; for use on the cream/white
 *               default background so the chip doesn't visually merge.
 *
 * Visual chip is sized ~16-18px to match body text and avoid the
 * "stacked blocks" look some shortcut indicators fall into.
 */

interface KbdHintProps {
  /** Keys to display, in order. Use a Unicode glyph (⌘ ⇧ ⌥ ⏎) or a
   *  single Latin character. Each entry becomes its own chip. */
  keys: string[];
  /** Optional label that sits to the left of the keys ("Search", "Save"). */
  label?: string;
  variant?: "light" | "dark";
  className?: string;
}

export function KbdHint({
  keys,
  label,
  variant = "dark",
  className,
}: KbdHintProps) {
  return (
    <span
      role="presentation"
      className={clsx(
        "inline-flex items-center gap-1 font-body text-[11px] text-muted",
        className,
      )}
    >
      {label ? <span className="mr-1">{label}</span> : null}
      {keys.map((k, i) => (
        <kbd
          key={`${k}-${i}`}
          className={clsx(
            "inline-flex min-w-[20px] items-center justify-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] leading-none",
            variant === "light"
              ? "border-white/20 bg-white/10 text-white/90"
              : "border-border bg-surface text-text shadow-xs",
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}