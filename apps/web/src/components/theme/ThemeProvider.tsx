"use client";

/**
 * ThemeProvider — Sprint 12A.
 *
 * Subscribes to `useThemeStore` and writes the active theme onto
 * `<html data-theme>` so the CSS-variable layer (`tokens.css`) can swap
 * palettes without re-mounting any components.
 *
 * Three modes:
 *   - `light` / `dark` — fixed, write the literal value.
 *   - `system`        — follow `prefers-color-scheme`; also react to
 *                        runtime changes (e.g. user toggling OS dark
 *                        mode while the app is open).
 *
 * The provider intentionally renders no DOM. It only exists to host
 * the side-effect, so the children pass through unchanged.
 */

import { useEffect } from "react";

import { type Theme, useThemeStore } from "@/lib/stores/theme";

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Server-resolved default (cookie-based). Used on first render before
   *  the persisted Zustand state hydrates to avoid an SSR mismatch. */
  defaultTheme?: Theme;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (theme === "system") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    html.setAttribute("data-theme", mq.matches ? "dark" : "light");
  } else {
    html.setAttribute("data-theme", theme);
  }
}

export function ThemeProvider({ children, defaultTheme = "light" }: ThemeProviderProps) {
  const theme = useThemeStore((s) => s.theme);

  // Sync the active theme onto <html>. Runs on every theme change and
  // also on mount (in case the persisted store hydrates to a value
  // different from the SSR-rendered default).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for OS-level scheme changes while the user is on `system`.
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const cb = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, [theme]);

  // First-render safety: apply the SSR-resolved default immediately so
  // the very first paint already matches, even if Zustand hydration
  // happens to be a tick late.
  useEffect(() => {
    if (defaultTheme && defaultTheme !== theme) {
      // Don't override if the persisted store already had a different
      // choice — that's the user's explicit pick.
      const persistedRaw =
        typeof window !== "undefined"
          ? window.localStorage.getItem("qr-menu-theme")
          : null;
      if (!persistedRaw) applyTheme(defaultTheme);
    }
    // We only want this to run once on mount; defaultTheme is treated as
    // the SSR snapshot and intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}