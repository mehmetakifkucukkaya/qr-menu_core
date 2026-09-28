"use client";

/**
 * ThemeToggle — Sprint 12A.
 *
 * Small pill button cycling through `light → dark → system → light`.
 * Used in the admin sidebar footer (12C) and (optionally) the public
 * header (12B). The cycling order is the simplest UX — three states
 * can confuse first-time users if presented all at once.
 *
 * A11y:
 *   - aria-label describes the *next* action ("Switch to dark mode")
 *     rather than the current state.
 *   - aria-pressed reflects the binary light/dark for assistive tech.
 *   - Focus-visible ring comes from the global `:focus-visible` rule
 *     in globals.css; no per-component override needed.
 */

import { Moon, Sun, Monitor } from "lucide-react";
import clsx from "clsx";

import { type Theme, useThemeStore } from "@/lib/stores/theme";

const ORDER: Theme[] = ["light", "dark", "system"];

function nextTheme(current: Theme): Theme {
  const idx = ORDER.indexOf(current);
  return ORDER[(idx + 1) % ORDER.length];
}

const ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<Theme, string> = {
  light: "Aydınlık",
  dark: "Karanlık",
  system: "Sistem",
};

const NEXT_LABEL: Record<Theme, string> = {
  light: "Karanlık moda geç",
  dark: "Sistem tercihine dön",
  system: "Aydınlık moda geç",
};

interface ThemeToggleProps {
  /** Tailwind size variant — `sm` for tight rows, `md` for general use. */
  size?: "sm" | "md";
  className?: string;
}

export function ThemeToggle({ size = "md", className }: ThemeToggleProps) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const Icon = ICONS[theme];
  const isDark = theme === "dark";

  const handleClick = () => {
    setTheme(nextTheme(theme));
  };

  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={NEXT_LABEL[theme]}
      aria-pressed={isDark}
      title={`Tema: ${LABELS[theme]} (${NEXT_LABEL[theme]})`}
      className={clsx(
        dim,
        "inline-flex items-center justify-center rounded-full",
        "border border-border bg-surface text-text",
        "transition-[background-color,color,border-color] duration-200",
        "hover:bg-background hover:text-primary",
        "active:scale-95",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
      <span className="sr-only">{LABELS[theme]} tema</span>
    </button>
  );
}