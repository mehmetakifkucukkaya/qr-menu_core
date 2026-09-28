import type { Config } from "tailwindcss";

/**
 * Tailwind config — Modern Cafe palette exposed as CSS variables so the
 * per-business theme can override tokens at runtime via inline style on the
 * BusinessHero wrapper. See docs/SPRINT_3_PLAN.md ("Theme Tokens").
 *
 * Sprint 12A additions:
 *   • Box-shadow scale (xs/sm/md/lg/xl) plus legacy aliases
 *   • Border-radius scale (xl/pill) — DEFAULT/sm/md/lg kept for back-compat
 *   • Animation + keyframes (pulse-soft kitchen ambient, fade-in, slide-up
 *     for bottom-sheet draw-downs in 12B+)
 *   • `fontFamily.heading` / `fontFamily.body` re-pinned to the Google Fonts
 *     pair (Playfair Display SC + Karla)
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tailwind utilities that reference the CSS variables defined in
        // src/styles/tokens.css. Components should prefer these semantic
        // tokens over raw hex values so the per-business theme can swap them.
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--color-primary-foreground) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        lg: "var(--radius)",
        md: "calc(var(--radius) * 0.75)",
        sm: "calc(var(--radius) * 0.5)",
        // New radius scale (Sprint 12A).
        xs: "var(--radius-xs)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        // Legacy aliases — kept so existing `shadow-card` / `shadow-floating`
        // usages continue to work without per-component rewrites.
        card: "var(--shadow-card)",
        floating: "var(--shadow-floating)",
        // New layered scale (Sprint 12A).
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      // Animation tokens (Sprint 12A).
      animation: {
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite",
        "fade-in": "fade-in var(--transition-base) var(--ease-out-cubic)",
        "slide-up": "slide-up var(--transition-base) var(--ease-out-cubic)",
        // Legacy kitchen pulse kept for the existing
        // `.kitchen-ticket-pending` rule in globals.css.
        "kitchen-pulse": "kitchen-pulse 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-soft": {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.04)", opacity: "0.92" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "kitchen-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(224, 120, 86, 0)" },
          "50%": { boxShadow: "0 0 0 8px rgba(224, 120, 86, 0.15)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;