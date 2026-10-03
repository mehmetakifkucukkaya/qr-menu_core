import type { Config } from "tailwindcss";

/**
 * Tailwind config — Velouté palette exposed as CSS variables so the
 * per-business theme can override tokens at runtime via an inline style on
 * the public menu wrapper. Token values live in src/styles/tokens.css.
 *
 * Every colour below is registered with the `rgb(var(--x) / <alpha-value>)`
 * pattern. That is what makes `bg-surface-low`, `border-border`, `text-outline`
 * and opacity modifiers (`bg-background/80`) work. Writing the variable by hand
 * (`border-[var(--color-border)]`) produces INVALID CSS, because the variables
 * hold bare RGB triplets — see the ESLint rule in .eslintrc.json.
 *
 * Modernisation pass:
 *   • surface-low / surface-high / border-strong / input / outline were used in
 *     components but never registered → silently dropped. Now defined.
 *   • danger / success / warning (+ -soft) so error states stop borrowing the
 *     olive `accent`.
 *   • Softer radius scale (12–28 px) and layered, warm shadow scale.
 *   • z-index scale, sheet / pop / shimmer keyframes.
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
        // Brand
        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-foreground": "rgb(var(--color-primary-foreground) / <alpha-value>)",
        "primary-soft": "rgb(var(--color-primary-soft) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        "secondary-soft": "rgb(var(--color-secondary-soft) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        // Surfaces & text
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-low": "rgb(var(--color-surface-low) / <alpha-value>)",
        "surface-high": "rgb(var(--color-surface-high) / <alpha-value>)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        outline: "rgb(var(--color-outline) / <alpha-value>)",
        // Legacy alias: `text-on-surface-variant` was used for secondary copy.
        "on-surface-variant": "rgb(var(--color-muted) / <alpha-value>)",
        // Lines
        border: "rgb(var(--color-border) / <alpha-value>)",
        "border-strong": "rgb(var(--color-border-strong) / <alpha-value>)",
        input: "rgb(var(--color-input) / <alpha-value>)",
        // Status
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        "danger-soft": "rgb(var(--color-danger-soft) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        "success-soft": "rgb(var(--color-success-soft) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        "warning-soft": "rgb(var(--color-warning-soft) / <alpha-value>)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "2rem",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        // Legacy aliases kept so existing `shadow-card` / `shadow-floating`
        // usages continue to work without per-component rewrites.
        card: "var(--shadow-card)",
        floating: "var(--shadow-floating)",
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        ring: "var(--shadow-ring)",
      },
      ringColor: {
        DEFAULT: "rgb(var(--color-primary) / 0.5)",
      },
      // One z-index scale for every sticky / floating layer. Native <dialog>
      // sheets live in the browser's top layer and need no z-index at all.
      zIndex: {
        raised: "10",
        nav: "20",
        header: "30",
        dock: "40",
        toast: "60",
        skip: "100",
      },
      transitionTimingFunction: {
        "out-expo": "var(--ease-out-cubic)",
        spring: "var(--ease-spring)",
      },
      animation: {
        "pulse-soft": "pulse-soft 2.5s ease-in-out infinite",
        "fade-in": "fade-in var(--transition-base) var(--ease-out-cubic)",
        "slide-up": "slide-up var(--transition-base) var(--ease-out-cubic)",
        "sheet-up": "sheet-up 320ms var(--ease-out-cubic)",
        "sheet-right": "sheet-right 320ms var(--ease-out-cubic)",
        "sheet-left": "sheet-left 320ms var(--ease-out-cubic)",
        pop: "pop 260ms var(--ease-spring)",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        // Legacy kitchen pulse kept for the `.kitchen-ticket-pending` rule.
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
          from: { transform: "translateY(8px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "sheet-up": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "sheet-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "sheet-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
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
