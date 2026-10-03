"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";

import { useSignupWizard, MAX_SUPPORTED_LOCALES } from "@/lib/stores/signup-wizard";
import type { AuthCurrency, AuthLocaleCode } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Locale + currency presets — kept local to this component so a future
// i18n bump on the backend (D-028) only touches this one file.
// ---------------------------------------------------------------------------

interface LocaleOption {
  code: AuthLocaleCode;
  label: string;
  flag: string;
}

const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
];

interface CurrencyOption {
  code: AuthCurrency;
  label: string;
  symbol: string;
}

const CURRENCY_OPTIONS: readonly CurrencyOption[] = [
  { code: "TRY", label: "Türk Lirası", symbol: "₺" },
  { code: "EUR", label: "Euro", symbol: "€" },
  { code: "USD", label: "US Dollar", symbol: "$" },
  { code: "GBP", label: "British Pound", symbol: "£" },
];

/**
 * Step2LocaleCurrency — wizard step 2.
 *
 * Lets the operator pick:
 *   - default_locale      (single radio — drives Step 1's submit payload)
 *   - supported_locales   (checkbox, capped at MAX_SUPPORTED_LOCALES = 8
 *                          to mirror the backend SignupSerializer)
 *   - currency            (single radio)
 *
 * Validation mirrors the backend's `validate_supported_locales`: the
 * default locale MUST appear in the supported list, otherwise the
 * user is bounced back to the form before they can advance.
 *
 * The wizard currently has no backend call here — everything lives in
 * the local zustand store. Sprint C3's onboarding/complete/ endpoint
 * will pick up the same payload shape.
 */
export function Step2LocaleCurrency() {
  const form = useSignupWizard((s) => s.formData);
  const updateForm = useSignupWizard((s) => s.updateForm);
  const setStep = useSignupWizard((s) => s.setStep);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (form.supported_locales.length === 0) {
      errors.supported_locales = "En az bir dil seçmelisiniz.";
    }
    if (!form.supported_locales.includes(form.default_locale)) {
      errors.default_locale =
        "Varsayılan dil, desteklenen diller listesinde olmalı.";
    }
    if (form.supported_locales.length > MAX_SUPPORTED_LOCALES) {
      errors.supported_locales = `En fazla ${MAX_SUPPORTED_LOCALES} dil seçebilirsiniz.`;
    }
    return errors;
  }, [form.default_locale, form.supported_locales]);

  const hasErrors = Object.keys(validation).length > 0;

  function toggleLocale(code: AuthLocaleCode) {
    const current = form.supported_locales;
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    updateForm({ supported_locales: next });
  }

  function handleNext() {
    if (hasErrors) return;
    setStep(3);
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-lg font-semibold text-text">
          Dil ve para birimi
        </h2>
        <p className="mt-1 text-sm text-muted">
          Müşterilerinize hangi dillerde hizmet vereceksiniz?
        </p>
      </header>

      {/* ---- Default locale ------------------------------------------------ */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Varsayılan dil</legend>
        <p className="text-xs text-muted">
          QR menüyü açan müşterinin gördüğü ilk dil.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LOCALE_OPTIONS.slice(0, 4).map((opt) => {
            const selected = form.default_locale === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => updateForm({ default_locale: opt.code })}
                aria-pressed={selected}
                className={clsx(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected
                    ? "border-primary bg-primary/5 text-text"
                    : "border-border bg-surface text-text hover:border-primary/40",
                )}
              >
                <span aria-hidden className="text-base">
                  {opt.flag}
                </span>
                <span className="font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ---- Supported locales -------------------------------------------- */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">
          Desteklenen diller
          <span className="ml-1 text-xs font-normal text-muted">
            ({form.supported_locales.length} / {MAX_SUPPORTED_LOCALES})
          </span>
        </legend>
        <p className="text-xs text-muted">
          Müşteriler kendi dillerinde gezinebilsin diye ek diller ekleyin.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LOCALE_OPTIONS.map((opt) => {
            const checked = form.supported_locales.includes(opt.code);
            return (
              <label
                key={opt.code}
                className={clsx(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                  checked
                    ? "border-primary bg-primary/5 text-text"
                    : "border-border bg-surface text-text hover:border-primary/40",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleLocale(opt.code)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span aria-hidden className="text-base">
                  {opt.flag}
                </span>
                <span className="font-medium">{opt.label}</span>
              </label>
            );
          })}
        </div>
        {validation.supported_locales ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {validation.supported_locales}
          </p>
        ) : null}
        {validation.default_locale ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {validation.default_locale}
          </p>
        ) : null}
      </fieldset>

      {/* ---- Currency ----------------------------------------------------- */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Para birimi</legend>
        <p className="text-xs text-muted">
          Fiyatlar bu para biriminde gösterilecek.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CURRENCY_OPTIONS.map((opt) => {
            const selected = form.currency === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                onClick={() => updateForm({ currency: opt.code })}
                aria-pressed={selected}
                className={clsx(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  selected
                    ? "border-primary bg-primary/5 text-text"
                    : "border-border bg-surface text-text hover:border-primary/40",
                )}
              >
                <span aria-hidden className="text-base">
                  {opt.symbol}
                </span>
                <span className="font-medium">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="text-sm font-medium text-muted hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded px-2 py-1"
        >
          ← Geri
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={hasErrors}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Devam et
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}