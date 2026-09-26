import type { Config } from "tailwindcss";

/**
 * Tailwind config — Modern Cafe palette exposed as CSS variables so the
 * per-business theme can override tokens at runtime via inline style on the
 * BusinessHero wrapper. See docs/SPRINT_3_PLAN.md ("Theme Tokens").
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
      },
      boxShadow: {
        card: "0 4px 14px rgb(var(--color-text) / 0.08)",
        floating: "0 8px 24px rgb(var(--color-text) / 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
