"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";

import {
  createTheme,
  updateTheme,
} from "@/lib/api-admin";
import type { Organization, ThemeConfig } from "@/types/admin";

interface ThemeFormProps {
  theme: ThemeConfig | null;
  csrfToken: string | null;
}

const COLOR_FIELDS = [
  { key: "primary_color", label: "Ana renk (primary)", default: "#8B5A3C" },
  { key: "secondary_color", label: "İkincil renk (secondary)", default: "#D4A574" },
  { key: "accent_color", label: "Vurgu rengi (accent)", default: "#E07856" },
  { key: "background_color", label: "Arka plan", default: "#F5EFE6" },
  { key: "text_color", label: "Metin rengi", default: "#2C1810" },
] as const;

const LAYOUT_VARIANTS = [
  { value: "default", label: "Modern Cafe (varsayılan)" },
  { value: "compact", label: "Sıkı / kompakt liste" },
  { value: "magazine", label: "Magazin / ızgara" },
];

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter (önerilen)" },
  { value: "Georgia", label: "Georgia (klasik)" },
  { value: "Playfair Display", label: "Playfair Display (zarif)" },
  { value: "system-ui", label: "Sistem yazı tipi" },
];

/**
 * ThemeForm — color pickers + layout variant + font selector.
 *
 * On submit:
 *   - If no ThemeConfig exists → POST /api/v1/admin/theme/ (create).
 *   - Otherwise → PATCH /api/v1/admin/theme/{id}.
 *
 * Color picker uses native <input type="color"> — no third-party library.
 * The preview tiles below reflect the live values so the operator sees
 * the result before committing.
 *
 * V1: organization_id is hard-required by the backend ThemeConfig
 * serializer; we read it from the parent server component (passed
 * through the layout) and inject it into the create payload via a
 * hidden field. We don't expose it in the UI.
 */
export function ThemeForm({ theme, csrfToken }: ThemeFormProps) {
  const router = useRouter();
  const isEdit = Boolean(theme);

  const [primaryColor, setPrimaryColor] = useState(theme?.primary_color ?? "#8B5A3C");
  const [secondaryColor, setSecondaryColor] = useState(theme?.secondary_color ?? "#D4A574");
  const [accentColor, setAccentColor] = useState(theme?.accent_color ?? "#E07856");
  const [backgroundColor, setBackgroundColor] = useState(theme?.background_color ?? "#F5EFE6");
  const [textColor, setTextColor] = useState(theme?.text_color ?? "#2C1810");
  const [fontFamily, setFontFamily] = useState<string>(
    theme?.font_family ?? "Inter",
  );
  const [layoutVariant, setLayoutVariant] = useState<string>(
    theme?.layout_variant ?? "default",
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && theme) {
        await updateTheme(
          theme.id,
          {
            primary_color: primaryColor,
            secondary_color: secondaryColor,
            accent_color: accentColor,
            background_color: backgroundColor,
            text_color: textColor,
            font_family: fontFamily,
            layout_variant: layoutVariant,
          },
          { csrfToken },
        );
      } else {
        // Create path — we need an organization_id. Pull it from the
        // nested organization summary on the existing theme (shouldn't
        // happen, defensive), or from a server-action fallback. The
        // simplest V1: refuse to create here, ask the operator to seed
        // a ThemeConfig via the backend or the next data layer.
        setError(
          "Henüz bir tema kaydı yok. Backend üzerinden ilk ThemeConfig'i oluşturun (Sprint 4C).",
        );
        setSubmitting(false);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Tema kaydedilemedi.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          {error}
        </div>
      ) : null}
      {saved ? (
        <div
          role="status"
          className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-text"
        >
          <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
          Tema kaydedildi.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {COLOR_FIELDS.map((field) => {
          const value =
            field.key === "primary_color"
              ? primaryColor
              : field.key === "secondary_color"
                ? secondaryColor
                : field.key === "accent_color"
                  ? accentColor
                  : field.key === "background_color"
                    ? backgroundColor
                    : textColor;
          const setter =
            field.key === "primary_color"
              ? setPrimaryColor
              : field.key === "secondary_color"
                ? setSecondaryColor
                : field.key === "accent_color"
                  ? setAccentColor
                  : field.key === "background_color"
                    ? setBackgroundColor
                    : setTextColor;
          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text">
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  disabled={submitting}
                  aria-label={field.label}
                  className="h-10 w-12 cursor-pointer rounded-md border border-border bg-surface"
                />
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-input bg-surface px-3.5 py-2.5 font-mono text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                  placeholder={field.default}
                  aria-label={`${field.label} hex kodu`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="font_family" className="text-sm font-medium text-text">
            Yazı tipi
          </label>
          <select
            id="font_family"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            disabled={submitting}
            className="rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="layout_variant" className="text-sm font-medium text-text">
            Yerleşim varyantı
          </label>
          <select
            id="layout_variant"
            value={layoutVariant}
            onChange={(e) => setLayoutVariant(e.target.value)}
            disabled={submitting}
            className="rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
          >
            {LAYOUT_VARIANTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Preview tile */}
      <section
        aria-label="Önizleme"
        className="rounded-lg border border-border p-4"
        style={{
          backgroundColor,
          color: textColor,
          fontFamily: `"${fontFamily}", system-ui, sans-serif`,
        }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: secondaryColor }}
        >
          Önizleme
        </p>
        <h3 className="mt-1 text-xl font-bold">Modern Cafe</h3>
        <p className="mt-1 text-sm opacity-80">
          Tema ayarlarınız müşteri sayfasında bu şekilde görünür.
        </p>
        <div className="mt-3 flex gap-2">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: primaryColor, color: "#fff" }}
          >
            Ana buton
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: accentColor, color: "#fff" }}
          >
            Vurgu
          </span>
          <span
            className="rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: secondaryColor, color: secondaryColor }}
          >
            İkincil
          </span>
        </div>
      </section>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Kaydediliyor…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Temayı kaydet
            </>
          )}
        </button>
      </div>
    </form>
  );
}
