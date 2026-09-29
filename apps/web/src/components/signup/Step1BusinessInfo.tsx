"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from "lucide-react";
import clsx from "clsx";

import { FormField } from "@/app/(admin)/_components/FormField";
import { useSignupWizard } from "@/lib/stores/signup-wizard";
import {
  checkSlugAvailability,
  signup,
  type SlugAvailability,
} from "@/lib/api-auth";
import { AdminApiError } from "@/lib/api-admin";

// ---------------------------------------------------------------------------
// Client-side validation helpers (defense-in-depth — backend re-validates).
// ---------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors backend: ^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const PASSWORD_MIN = 8;

const DEBOUNCE_MS = 300;

type SlugStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "ok"; slug: string }
  | { kind: "taken" }
  | { kind: "reserved" }
  | { kind: "invalid" };

/**
 * Map the backend's `reason` field to a UI status. Keeps the user-
 * facing copy in one place so Step 2-5 can reuse the same vocabulary.
 */
function reasonToStatus(reason: SlugAvailability["reason"], slug: string): SlugStatus {
  if (reason === "taken") return { kind: "taken" };
  if (reason === "reserved") return { kind: "reserved" };
  if (reason === "invalid") return { kind: "invalid" };
  if (reason === "empty") return { kind: "idle" };
  return { kind: "ok", slug };
}

/**
 * Step1BusinessInfo — wizard step 1.
 *
 * Collects email + password + full_name + business_name + slug. The
 * slug field has a real-time availability check (300ms debounce
 * against /api/v1/auth/check-slug/) with an inline status indicator.
 *
 * On submit: POST /api/v1/auth/signup/ → on 201, advance to step 2.
 * Backend errors are mapped to inline field-level messages; rate-
 * limit (429) renders a top-level alert with the retry hint.
 *
 * Auto-derived slug: when the user types a business name and the slug
 * field is still empty, we offer a kebab-case suggestion (one-shot,
 * not live — we don't want to fight the user mid-typing).
 */
export function Step1BusinessInfo() {
  const form = useSignupWizard((s) => s.formData);
  const updateForm = useSignupWizard((s) => s.updateForm);
  const setStep = useSignupWizard((s) => s.setStep);

  // ---- Local UI state (not persisted — purely view-layer) -----------------
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: "idle" });
  const [slugTouched, setSlugTouched] = useState(Boolean(form.slug));
  const [autoSlugTried, setAutoSlugTried] = useState(false);

  // ---- Validation (re-runs on every keystroke) ----------------------------
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!form.email.trim()) errors.email = "Email zorunlu.";
    else if (!EMAIL_RE.test(form.email.trim())) errors.email = "Geçerli bir email girin.";

    if (!form.password) errors.password = "Şifre zorunlu.";
    else if (form.password.length < PASSWORD_MIN)
      errors.password = `Şifre en az ${PASSWORD_MIN} karakter olmalı.`;

    if (!form.full_name.trim()) errors.full_name = "Ad soyad zorunlu.";

    if (!form.business_name.trim()) errors.business_name = "İşletme adı zorunlu.";
    else if (form.business_name.trim().length > 160)
      errors.business_name = "İşletme adı en fazla 160 karakter olabilir.";

    if (!form.slug.trim()) errors.slug = "Slug zorunlu.";
    else if (!SLUG_RE.test(form.slug.trim()))
      errors.slug = "Slug: küçük harf, rakam ve tire (1-40 karakter).";

    return errors;
  }, [form]);

  const isSlugInvalidFormat = form.slug.trim() && !SLUG_RE.test(form.slug.trim());

  // ---- Debounced slug availability check -----------------------------------
  // We re-run whenever `form.slug` changes; the effect cancels its own
  // previous timer so only the latest keystroke actually fires.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const slug = form.slug.trim();
    if (!slug || isSlugInvalidFormat) {
      setSlugStatus({ kind: "idle" });
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    setSlugStatus({ kind: "checking" });
    const myReq = ++reqIdRef.current;

    debounceRef.current = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(slug);
        // Drop stale responses — only the latest request wins.
        if (myReq !== reqIdRef.current) return;
        setSlugStatus(reasonToStatus(result.reason, result.slug));
      } catch {
        if (myReq !== reqIdRef.current) return;
        // Network blip — surface a soft "checking failed, retry" by
        // falling back to idle so the user knows we'll re-check on
        // the next keystroke.
        setSlugStatus({ kind: "idle" });
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.slug, isSlugInvalidFormat]);

  // ---- Auto-slug suggestion (one-shot, only if slug is empty) --------------
  function suggestSlugFromBusiness() {
    if (autoSlugTried) return;
    const candidate = form.business_name
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 38);
    if (candidate && SLUG_RE.test(candidate)) {
      updateForm({ slug: candidate });
      setSlugTouched(true);
    }
    setAutoSlugTried(true);
  }

  // ---- Submit --------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      return;
    }

    // Refuse to submit with an unconfirmed slug.
    if (slugStatus.kind === "checking") return;
    if (
      slugStatus.kind === "taken" ||
      slugStatus.kind === "reserved" ||
      slugStatus.kind === "invalid"
    ) {
      setFieldErrors({ slug: "Bu slug kullanılamaz, lütfen farklı bir tane seçin." });
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        business_name: form.business_name.trim(),
        slug: form.slug.trim(),
        default_locale: form.default_locale,
        supported_locales: form.supported_locales,
        currency: form.currency,
      });
      // 201 + session cookie set → advance to step 2.
      setStep(2);
    } catch (err: unknown) {
      if (err instanceof AdminApiError) {
        if (err.status === 429) {
          setFormError(
            "Çok fazla deneme yaptınız. Lütfen 1 saat sonra tekrar deneyin.",
          );
        } else if (err.status === 400) {
          // Backend may return DRF-style field errors via the message;
          // surface the raw message — it's already user-friendly.
          setFormError(err.message);
        } else if (err.status === 0) {
          setFormError(
            "Ağ hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.",
          );
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Render --------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <header>
        <h2 className="font-heading text-lg font-semibold text-text">
          İşletme bilgileri
        </h2>
        <p className="mt-1 text-sm text-muted">
          Hesabınızı ve işletmenizi oluşturalım. Sonraki adımlarda menü
          detaylarını ekleyeceksiniz.
        </p>
      </header>

      {formError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-text"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>{formError}</span>
        </div>
      ) : null}

      <FormField
        label="Email"
        name="email"
        type="email"
        value={form.email}
        onChange={(v) => updateForm({ email: v })}
        autoComplete="email"
        placeholder="ornek@firma.com"
        error={fieldErrors.email}
        required
      />

      <div>
        <label
          htmlFor="signup-password"
          className="text-sm font-medium text-text"
        >
          Şifre
          <span aria-hidden className="ml-0.5 text-accent">*</span>
        </label>
        <div className="relative mt-1.5">
          <input
            id="signup-password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={form.password}
            onChange={(e) => updateForm({ password: e.target.value })}
            autoComplete="new-password"
            required
            aria-invalid={fieldErrors.password ? "true" : undefined}
            className={clsx(
              "w-full rounded-md border bg-surface px-3 py-2 pr-10 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:ring-2",
              fieldErrors.password
                ? "border-accent focus:border-accent focus:ring-accent/30"
                : "border-border focus:border-primary focus:ring-primary/30",
            )}
            placeholder="En az 8 karakter"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-background hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {fieldErrors.password ? (
          <p role="alert" className="mt-1 text-xs font-medium text-accent">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <FormField
        label="Ad Soyad"
        name="full_name"
        type="text"
        value={form.full_name}
        onChange={(v) => updateForm({ full_name: v })}
        autoComplete="name"
        placeholder="Cafe Sahibi"
        error={fieldErrors.full_name}
        required
      />

      <BusinessNameField
        value={form.business_name}
        error={fieldErrors.business_name}
        onChange={(v) => updateForm({ business_name: v })}
        onBlur={suggestSlugFromBusiness}
      />

      <div>
        <label
          htmlFor="signup-slug"
          className="text-sm font-medium text-text"
        >
          Slug (URL)
          <span aria-hidden className="ml-0.5 text-accent">*</span>
        </label>
        <div
          className={clsx(
            "mt-1.5 flex items-center rounded-md border bg-surface px-3 py-2 text-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30",
            fieldErrors.slug || slugStatus.kind === "taken" || slugStatus.kind === "reserved"
              ? "border-accent focus-within:border-accent focus-within:ring-accent/30"
              : "border-border",
          )}
        >
          <span className="select-none text-muted">qr-menu.app/m/</span>
          <input
            id="signup-slug"
            name="slug"
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setAutoSlugTried(true); // user is now driving
              updateForm({ slug: e.target.value.toLowerCase() });
            }}
            required
            aria-invalid={
              fieldErrors.slug ||
              slugStatus.kind === "taken" ||
              slugStatus.kind === "reserved" ||
              slugStatus.kind === "invalid"
                ? "true"
                : undefined
            }
            placeholder="modern-cafe"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="ml-1 flex-1 bg-transparent text-text placeholder:text-muted/70 focus:outline-none"
          />
          <SlugStatusIcon status={slugStatus} />
        </div>
        <SlugStatusHint status={slugStatus} touched={slugTouched} />
        {fieldErrors.slug ? (
          <p role="alert" className="mt-1 text-xs font-medium text-accent">
            {fieldErrors.slug}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Hesap oluşturuluyor…
            </>
          ) : (
            "Devam et"
          )}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Tiny status indicator + helper text below the slug input.
// ---------------------------------------------------------------------------

interface BusinessNameFieldProps {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/**
 * Local copy of the FormField shape — extends it with the `onBlur`
 * callback so we can fire the one-shot auto-slug suggestion when the
 * user leaves the field. Keeps the dashboard's FormField contract
 * unchanged for everyone else.
 */
function BusinessNameField({
  value,
  error,
  onChange,
  onBlur,
}: BusinessNameFieldProps) {
  const id = "signup-business-name";
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        İşletme Adı
        <span aria-hidden className="ml-0.5 text-accent">*</span>
      </label>
      <input
        id={id}
        name="business_name"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required
        autoComplete="organization"
        placeholder="Örn. Modern Cafe"
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        className={
          "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30" +
          (error ? " border-accent focus:border-accent focus:ring-accent/30" : "")
        }
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SlugStatusIcon({ status }: { status: SlugStatus }) {
  if (status.kind === "checking") {
    return (
      <Loader2
        aria-hidden
        className="ml-2 h-4 w-4 shrink-0 animate-spin text-muted"
      />
    );
  }
  if (status.kind === "ok") {
    return (
      <Check
        aria-hidden
        className="ml-2 h-4 w-4 shrink-0 text-primary"
        aria-label="Slug uygun"
      />
    );
  }
  if (status.kind === "taken" || status.kind === "reserved" || status.kind === "invalid") {
    return (
      <AlertCircle
        aria-hidden
        className="ml-2 h-4 w-4 shrink-0 text-accent"
        aria-label="Slug kullanılamaz"
      />
    );
  }
  return null;
}

function SlugStatusHint({
  status,
  touched,
}: {
  status: SlugStatus;
  touched: boolean;
}) {
  if (!touched) {
    return (
      <p className="mt-1 text-xs text-muted">
        Küçük harf, rakam ve tire kullanın. Müşterileriniz menüye bu
        adresle ulaşacak.
      </p>
    );
  }
  if (status.kind === "checking") {
    return (
      <p className="mt-1 text-xs text-muted" aria-live="polite">
        Kontrol ediliyor…
      </p>
    );
  }
  if (status.kind === "ok") {
    return (
      <p className="mt-1 text-xs text-primary" aria-live="polite">
        ✓ Bu slug uygun.
      </p>
    );
  }
  if (status.kind === "taken") {
    return (
      <p className="mt-1 text-xs text-accent" aria-live="polite">
        ✗ Bu slug zaten kullanımda. Farklı bir tane deneyin.
      </p>
    );
  }
  if (status.kind === "reserved") {
    return (
      <p className="mt-1 text-xs text-accent" aria-live="polite">
        ✗ Bu slug sistem için ayrılmış.
      </p>
    );
  }
  if (status.kind === "invalid") {
    return (
      <p className="mt-1 text-xs text-accent" aria-live="polite">
        ✗ Geçersiz format. Sadece küçük harf, rakam ve tire kullanın.
      </p>
    );
  }
  return null;
}