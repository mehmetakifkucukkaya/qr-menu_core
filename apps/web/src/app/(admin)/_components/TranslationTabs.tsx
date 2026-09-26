"use client";

import { useId, useState } from "react";
import clsx from "clsx";

import type { AdminLocaleCode, MenuTranslation } from "@/types/admin";

interface TranslationTabsProps<TName extends string = string> {
  /** Available locale codes — typically `["tr", "en"]`. */
  locales: AdminLocaleCode[];
  /** Map of locale → translation object (so the consumer owns the data shape). */
  value: Partial<Record<AdminLocaleCode, { name: string; description?: string }>>;
  /** Called when a locale's fields change. */
  onChange: (
    next: Partial<
      Record<AdminLocaleCode, { name: string; description?: string }>
    >,
  ) => void;
  /** Optional label for the description field (default "Açıklama"). */
  descriptionLabel?: string;
  /** Optional label for the name field (default "İsim"). */
  nameLabel?: string;
  /** Optional hint shown beneath the description input. */
  descriptionHint?: string;
  /** Name attribute prefix for hidden inputs (form-friendly fallback). */
  namePrefix?: string;
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
 * TranslationTabs — TR/EN tab interface for translatable name + description
 * fields. Controlled component (parent owns the value).
 *
 * Used by:
 *   - MenuCategory create/edit (name + description)
 *   - MenuItem create/edit (name + description)
 *
 * Why a tab interface?
 *   - The Turkish entry is required (matches menu.default_locale).
 *   - English is optional. We surface each language as a tab so the
 *     operator can switch without losing unsaved work.
 *   - The backend receives the full `translations: [{locale, name,
 *     description}]` array (replace-style on PATCH, see MenuItemSerializer).
 */
export function TranslationTabs({
  locales,
  value,
  onChange,
  descriptionLabel = "Açıklama",
  nameLabel = "İsim",
  descriptionHint,
}: TranslationTabsProps) {
  const tabBaseId = useId();
  const safeLocales: AdminLocaleCode[] =
    locales.length > 0 ? locales : ["tr"];
  const [active, setActive] = useState<AdminLocaleCode>(safeLocales[0]);

  const updateLocale = (
    locale: AdminLocaleCode,
    patch: { name?: string; description?: string },
  ) => {
    const prev = value[locale] ?? { name: "", description: "" };
    const next = {
      ...value,
      [locale]: {
        name: patch.name !== undefined ? patch.name : prev.name,
        description:
          patch.description !== undefined ? patch.description : prev.description,
      },
    };
    onChange(next);
  };

  const activeValue = value[active] ?? { name: "", description: "" };

  return (
    <div className="flex flex-col gap-3">
      {/* Locale tabs */}
      <div
        role="tablist"
        aria-label="Çeviri dili"
        className="inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-surface p-1"
      >
        {safeLocales.map((locale) => {
          const isActive = locale === active;
          const filled = (value[locale]?.name ?? "").trim().length > 0;
          return (
            <button
              key={locale}
              type="button"
              role="tab"
              id={`${tabBaseId}-tab-${locale}`}
              aria-selected={isActive}
              aria-controls={`${tabBaseId}-panel-${locale}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActive(locale)}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted hover:bg-background",
              )}
            >
              <span aria-hidden>{LOCALE_FLAG[locale]}</span>
              <span>{LOCALE_LABEL[locale]}</span>
              {filled ? (
                <span
                  aria-hidden
                  className={clsx(
                    "ml-1 inline-block h-1.5 w-1.5 rounded-full",
                    isActive ? "bg-primary-foreground" : "bg-primary/60",
                  )}
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Active locale panel */}
      <div
        role="tabpanel"
        id={`${tabBaseId}-panel-${active}`}
        aria-labelledby={`${tabBaseId}-tab-${active}`}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${tabBaseId}-name-${active}`}
            className="text-sm font-medium text-text"
          >
            {nameLabel}
            <span className="ml-0.5 text-accent" aria-hidden>
              {active === safeLocales[0] ? "*" : ""}
            </span>
          </label>
          <input
            id={`${tabBaseId}-name-${active}`}
            type="text"
            value={activeValue.name}
            onChange={(e) => updateLocale(active, { name: e.target.value })}
            placeholder={`Örnek: ${active === "tr" ? "Türk Kahvesi" : "Turkish Coffee"}`}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`${tabBaseId}-desc-${active}`}
            className="text-sm font-medium text-text"
          >
            {descriptionLabel}
          </label>
          <textarea
            id={`${tabBaseId}-desc-${active}`}
            value={activeValue.description ?? ""}
            onChange={(e) =>
              updateLocale(active, { description: e.target.value })
            }
            rows={3}
            placeholder={
              active === "tr"
                ? "Kısa açıklama (opsiyonel)"
                : "Short description (optional)"
            }
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {descriptionHint ? (
            <p className="text-xs text-muted">{descriptionHint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Helper: flatten the TranslationTabs value to a `MenuTranslation[]` shape
 * the backend expects on POST/PATCH (locale + name + description). Locales
 * with an empty name are dropped so we don't send empty translation rows.
 */
export function translationsToArray(
  value: Partial<
    Record<AdminLocaleCode, { name: string; description?: string }>
  >,
): MenuTranslation[] {
  const out: MenuTranslation[] = [];
  for (const [locale, fields] of Object.entries(value) as [
    AdminLocaleCode,
    { name: string; description?: string },
  ][]) {
    if (!fields.name.trim()) continue;
    out.push({
      locale,
      name: fields.name.trim(),
      description: (fields.description ?? "").trim(),
    });
  }
  return out;
}
