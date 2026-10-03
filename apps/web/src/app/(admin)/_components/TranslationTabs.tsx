"use client";

import { useCallback, useId, useMemo, useState } from "react";
import clsx from "clsx";

import type { AdminLocaleCode, MenuTranslation } from "@/types/admin";

import { AIAssistButton } from "./AIAssistButton";
import { AITranslatePreviewModal } from "./AITranslatePreviewModal";
import {
  translateMenuCategory,
  translateMenuItem,
  translateText,
} from "@/lib/api-admin";

type EntityType = "menu_item" | "menu_category";

interface AIConfig {
  entityType: EntityType;
  entityId: number;
  /** CSRF token forwarded to the AI POST endpoints. */
  csrfToken: string | null;
}

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
  /**
   * When provided, the per-locale "AI Çevir" button is rendered and the
   * "Tümünü AI Çevir" action triggers the multi-locale translate endpoint.
   * Omit for non-translatable forms.
   */
  ai?: AIConfig | null;
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
 *
 * AI assist (Sprint 9B):
 *   - Per-locale "AI Çevir" button — translates the *current* locale's
 *     source text into the active tab's locale via the preview modal.
 *   - "Tümünü AI Çevir" primary button — calls the multi-locale endpoint
 *     and merges all returned translations into the local state.
 */
export function TranslationTabs({
  locales,
  value,
  onChange,
  descriptionLabel = "Açıklama",
  nameLabel = "İsim",
  descriptionHint,
  ai,
}: TranslationTabsProps) {
  const tabBaseId = useId();
  const safeLocales = useMemo<AdminLocaleCode[]>(
    () => (locales.length > 0 ? locales : ["tr"]),
    [locales],
  );
  const [active, setActive] = useState<AdminLocaleCode>(safeLocales[0]);

  // Per-locale preview modal state.
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSource, setPreviewSource] = useState("");
  const [previewSourceLocale, setPreviewSourceLocale] =
    useState<AdminLocaleCode>("tr");
  const [previewTargetLocale, setPreviewTargetLocale] =
    useState<AdminLocaleCode>("en");
  const [previewResult, setPreviewResult] =
    useState<Awaited<ReturnType<typeof translateText>> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const updateLocale = useCallback(
    (
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
    },
    [onChange, value],
  );

  const activeValue = value[active] ?? { name: "", description: "" };

  // Default source = first supported locale (typically `tr`). Per the API
  // contract the same source → target pair must hold for both name +
  // description. We use the same locale in both fields.
  const handleInlineTranslate = useCallback(
    async (sourceLocale: AdminLocaleCode, targetLocale: AdminLocaleCode) => {
      if (!ai) return;
      const current = value[sourceLocale] ?? { name: "", description: "" };
      // Use the name as the source string — descriptions are filled by
      // the description generator (separate endpoint) once an item exists.
      const sourceText = current.name.trim();
      if (!sourceText) {
        setPreviewError(
          "Önce kaynak dil için isim girin — AI çevirmek için metin gerekli.",
        );
        setPreviewResult(null);
        setPreviewSourceLocale(sourceLocale);
        setPreviewTargetLocale(targetLocale);
        setPreviewSource("");
        setPreviewOpen(true);
        setPreviewLoading(false);
        return;
      }
      setPreviewOpen(true);
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewSource(sourceText);
      setPreviewSourceLocale(sourceLocale);
      setPreviewTargetLocale(targetLocale);
      setPreviewResult(null);
      try {
        const result = await translateText(
          {
            text: sourceText,
            source_locale: sourceLocale,
            target_locale: targetLocale,
          },
          ai.csrfToken ?? "",
        );
        setPreviewResult(result);
      } catch (err) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "AI çeviri isteği başarısız.";
        setPreviewError(msg);
      } finally {
        setPreviewLoading(false);
      }
    },
    [ai, value],
  );

  const handleApplyPreview = useCallback(() => {
    if (!previewResult) return;
    const target = previewTargetLocale;
    const current = value[target] ?? { name: "", description: "" };
    updateLocale(target, {
      name: previewResult.translated,
      description: current.description ?? "",
    });
    setPreviewOpen(false);
  }, [previewResult, previewTargetLocale, value, updateLocale]);

  const handleBulkAI = useCallback(async () => {
    if (!ai) return;
    const firstSource = safeLocales[0];
    const targets = safeLocales.filter((l) => l !== firstSource);
    if (targets.length === 0) return;
    if (!ai.csrfToken) {
      throw new Error("CSRF token eksik. Sayfayı yenileyin.");
    }
    const payload = {
      source_locale: firstSource,
      target_locales: targets,
    };
    const response =
      ai.entityType === "menu_item"
        ? await translateMenuItem(ai.entityId, payload, ai.csrfToken)
        : await translateMenuCategory(ai.entityId, payload, ai.csrfToken);
    const patch: Partial<
      Record<AdminLocaleCode, { name: string; description?: string }>
    > = {};
    for (const row of response.translations) {
      patch[row.locale] = {
        name: row.translated_name,
        description: row.translated_description ?? "",
      };
    }
    onChange({ ...value, ...patch });
  }, [ai, onChange, safeLocales, value]);

  return (
    <div className="flex flex-col gap-3">
      {/* Locale tabs + AI bulk action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {ai && safeLocales.length > 1 ? (
          <AIAssistButton
            label="Tümünü AI Çevir"
            variant="primary"
            size="sm"
            action={handleBulkAI}
            testId="translation-tabs-bulk-ai"
          />
        ) : null}
      </div>

      {/* Active locale panel */}
      <div
        role="tabpanel"
        id={`${tabBaseId}-panel-${active}`}
        aria-labelledby={`${tabBaseId}-tab-${active}`}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`${tabBaseId}-name-${active}`}
              className="text-sm font-medium text-text"
            >
              {nameLabel}
              <span className="ml-0.5 text-danger" aria-hidden>
                {active === safeLocales[0] ? "*" : ""}
              </span>
            </label>
            {ai && active !== safeLocales[0] ? (
              <AIAssistButton
                label="AI Çevir"
                size="sm"
                action={() =>
                  handleInlineTranslate(safeLocales[0], active)
                }
                testId={`translation-tabs-inline-ai-${active}`}
              />
            ) : null}
          </div>
          <input
            id={`${tabBaseId}-name-${active}`}
            type="text"
            value={activeValue.name}
            onChange={(e) => updateLocale(active, { name: e.target.value })}
            placeholder={`Örnek: ${active === "tr" ? "Türk Kahvesi" : "Turkish Coffee"}`}
            className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`${tabBaseId}-desc-${active}`}
              className="text-sm font-medium text-text"
            >
              {descriptionLabel}
            </label>
            {ai && active !== safeLocales[0] ? (
              <AIAssistButton
                label="AI Çevir"
                size="sm"
                action={async () => {
                  const sourceText =
                    value[safeLocales[0]]?.description?.trim() ??
                    value[safeLocales[0]]?.name.trim() ??
                    "";
                  if (!sourceText) {
                    throw new Error(
                      "Önce kaynak dil için isim veya açıklama girin.",
                    );
                  }
                  const result = await translateText(
                    {
                      text: sourceText,
                      source_locale: safeLocales[0],
                      target_locale: active,
                    },
                    ai.csrfToken ?? "",
                  );
                  updateLocale(active, {
                    description: result.translated,
                  });
                }}
                testId={`translation-tabs-desc-ai-${active}`}
              />
            ) : null}
          </div>
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
            className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          />
          {descriptionHint ? (
            <p className="text-xs text-muted">{descriptionHint}</p>
          ) : null}
        </div>
      </div>

      <AITranslatePreviewModal
        open={previewOpen}
        sourceLocaleLabel={`${LOCALE_FLAG[previewSourceLocale]} ${LOCALE_LABEL[previewSourceLocale]}`}
        targetLocaleLabel={`${LOCALE_FLAG[previewTargetLocale]} ${LOCALE_LABEL[previewTargetLocale]}`}
        sourceText={previewSource}
        result={previewResult}
        loading={previewLoading}
        errorMessage={previewError}
        onApply={handleApplyPreview}
        onCancel={() => setPreviewOpen(false)}
      />
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
