"use client";

/**
 * Theme store — Sprint 12A (D-027 candidate).
 *
 * Zustand store + `persist` middleware for the user's light/dark/system
 * preference. Lives entirely on the client; the server reads the same
 * value from the `qr-menu-theme` cookie (set by `persist`) so SSR can
 * render the correct `data-theme` attribute without a flash of the
 * wrong theme.
 *
 * `partialize` keeps the cookie payload tiny — only the chosen theme
 * matters; the setter is a function reference that does not need to be
 * persisted across reloads.
 *
 * Why not React Context? The store needs to be reachable from both the
 * root `<html>` theme attribute AND from any deeply-nested
 * `<ThemeToggle>`. Zustand's vanilla selector model means neither caller
 * has to be inside a provider, which keeps the layout flat.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "qr-menu-theme",
      // Only persist the user's choice; ignore function refs that
      // `set` would otherwise serialise into the JSON blob.
      partialize: (state) => ({ theme: state.theme }),
    },
  ),
);