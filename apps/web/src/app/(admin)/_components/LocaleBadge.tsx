"use client";

import clsx from "clsx";

import type { AdminLocaleCode } from "@/types/admin";

interface LocaleBadgeProps {
  locale: AdminLocaleCode;
  /** When true, draws a solid pill (selected tab). Default false → outline. */
  active?: boolean;
  /** Size variant — `sm` for inline labels, `md` for headers. */
  size?: "sm" | "md";
  /** Show the flag emoji. Default true for active badges, false for outline. */
  showFlag?: boolean;
  /** Render as a button element instead of a span (used in pill toggles). */
  asButton?: boolean;
  /** Optional className passthrough. */
  className?: string;
  /** Optional click handler when used as a button (e.g. multi-select). */
  onClick?: () => void;
  /** Disable button when used as a pill (e.g. unsupported locale). */
  disabled?: boolean;
}

const LOCALE_LABEL: Record<AdminLocaleCode, string> = {
  tr: "Türkçe",
  en: "English",
};

const LOCALE_FLAG: Record<AdminLocaleCode, string> = {
  tr: "🇹🇷",
  en: "🇬🇧",
};

/**
 * LocaleBadge — tiny pill rendering a locale code with optional flag.
 *
 * Variants:
 *   - `outline` (default) — bordered, low emphasis. Used as inline
 *     gap indicators, table column headers, "needs translation" badges.
 *   - `solid` — primary-colored. Used for the active tab in
 *     TranslationTabs, the active selection in bulk modal steps.
 *
 * V1 backend only supports `tr` + `en` (LOCALE_CHOICES in
 * `apps/menu/models.py`). The component is typed against the union so
 * a future DE/AR addition is type-safe; operators see the unsupported
 * locales as disabled buttons when passed explicitly.
 */
export function LocaleBadge({
  locale,
  active = false,
  size = "sm",
  showFlag,
  asButton = false,
  className,
  onClick,
  disabled,
}: LocaleBadgeProps) {
  const flagVisible = showFlag ?? active;
  const Tag = asButton ? "button" : "span";

  return (
    <Tag
      type={asButton ? "button" : undefined}
      onClick={asButton ? onClick : undefined}
      disabled={asButton ? disabled : undefined}
      aria-pressed={asButton ? active : undefined}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full font-medium transition",
        size === "sm"
          ? "px-2 py-0.5 text-[11px] tracking-wider"
          : "px-2.5 py-1 text-xs tracking-wider",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border border-border bg-surface text-muted",
        asButton &&
          !disabled &&
          "cursor-pointer hover:border-primary/40 hover:text-text",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {flagVisible ? (
        <span aria-hidden className="leading-none">
          {LOCALE_FLAG[locale]}
        </span>
      ) : null}
      <span className="uppercase">{locale}</span>
      {size === "md" ? (
        <span className="font-normal normal-case opacity-80">
          · {LOCALE_LABEL[locale]}
        </span>
      ) : null}
    </Tag>
  );
}