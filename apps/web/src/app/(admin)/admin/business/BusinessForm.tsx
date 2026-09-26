"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save } from "lucide-react";

import { FormField } from "@/app/(admin)/_components/FormField";
import { ImageUpload } from "@/app/(admin)/_components/ImageUpload";
import { updateOrganization } from "@/lib/api-admin";
import type {
  AdminLocaleCode,
  Organization,
} from "@/types/admin";

const ALL_LOCALES: AdminLocaleCode[] = ["tr", "en"];
const LOCALE_LABEL: Record<AdminLocaleCode, string> = {
  tr: "Türkçe",
  en: "English",
};

const CURRENCY_OPTIONS = ["TRY", "EUR", "USD", "GBP"];

interface BusinessFormProps {
  organization: Organization;
  csrfToken: string | null;
}

/**
 * BusinessForm — controlled client form for organization settings.
 *
 * Submits a PATCH with only the fields the operator can edit. Read-only
 * fields (id, slug, created_at, updated_at) are intentionally omitted
 * from the payload — the backend serializer drops anything not in the
 * writable fields list.
 */
export function BusinessForm({ organization, csrfToken }: BusinessFormProps) {
  const router = useRouter();

  const [name, setName] = useState(organization.name ?? "");
  const [legalName, setLegalName] = useState(organization.legal_name ?? "");
  const [description, setDescription] = useState(organization.description ?? "");
  const [phone, setPhone] = useState(organization.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(organization.whatsapp_phone ?? "");
  const [email, setEmail] = useState(organization.email ?? "");
  const [website, setWebsite] = useState(organization.website ?? "");
  const [instagram, setInstagram] = useState(organization.instagram_url ?? "");
  const [address, setAddress] = useState(organization.address ?? "");
  const [googleMaps, setGoogleMaps] = useState(organization.google_maps_url ?? "");
  const [defaultLocale, setDefaultLocale] = useState<AdminLocaleCode>(
    organization.default_locale ?? "tr",
  );
  const [supportedLocales, setSupportedLocales] = useState<AdminLocaleCode[]>(
    organization.supported_locales ?? ["tr"],
  );
  const [currency, setCurrency] = useState<string>(organization.currency ?? "TRY");
  const [logoUrl, setLogoUrl] = useState<string | null>(organization.logo ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(organization.cover_image ?? null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleLocale = (locale: AdminLocaleCode) => {
    if (supportedLocales.includes(locale)) {
      if (locale === defaultLocale) return;
      setSupportedLocales(supportedLocales.filter((l) => l !== locale));
    } else {
      setSupportedLocales([...supportedLocales, locale]);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    if (!name.trim()) {
      setError("İşletme adı zorunludur.");
      return;
    }
    if (supportedLocales.length === 0) {
      setError("En az bir dil seçilmelidir.");
      return;
    }
    setSubmitting(true);
    try {
      await updateOrganization(
        organization.id,
        {
          name: name.trim(),
          legal_name: legalName.trim(),
          description: description.trim(),
          logo: logoUrl ?? "",
          cover_image: coverUrl ?? "",
          phone: phone.trim(),
          whatsapp_phone: whatsapp.trim(),
          email: email.trim(),
          website: website.trim(),
          instagram_url: instagram.trim(),
          address: address.trim(),
          google_maps_url: googleMaps.trim(),
          default_locale: defaultLocale,
          supported_locales: supportedLocales,
          currency,
        },
        { csrfToken },
      );
      setSaved(true);
      router.refresh();
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "İşletme bilgileri kaydedilemedi.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-text"
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
          Değişiklikler kaydedildi.
        </div>
      ) : null}

      <FormField
        label="İşletme adı"
        name="name"
        value={name}
        onChange={setName}
        required
        disabled={submitting}
      />

      <FormField
        label="Resmi ünvan"
        name="legal_name"
        value={legalName}
        onChange={setLegalName}
        hint="Fatura / yasal belgeler için."
        disabled={submitting}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-text">
          Kısa açıklama
        </label>
        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          disabled={submitting}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          label="Telefon"
          name="phone"
          type="tel"
          value={phone}
          onChange={setPhone}
          placeholder="+90 212 123 45 67"
          disabled={submitting}
        />
        <FormField
          label="WhatsApp"
          name="whatsapp_phone"
          type="tel"
          value={whatsapp}
          onChange={setWhatsapp}
          placeholder="+90 5xx xxx xx xx"
          disabled={submitting}
        />
        <FormField
          label="E-posta"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="hello@firma.com"
          disabled={submitting}
        />
        <FormField
          label="Web sitesi"
          name="website"
          type="url"
          value={website}
          onChange={setWebsite}
          placeholder="https://firma.com"
          disabled={submitting}
        />
        <FormField
          label="Instagram"
          name="instagram_url"
          type="url"
          value={instagram}
          onChange={setInstagram}
          placeholder="https://instagram.com/firma"
          disabled={submitting}
        />
        <FormField
          label="Google Maps linki"
          name="google_maps_url"
          type="url"
          value={googleMaps}
          onChange={setGoogleMaps}
          placeholder="https://maps.google.com/?q=..."
          disabled={submitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="address" className="text-sm font-medium text-text">
          Adres
        </label>
        <textarea
          id="address"
          name="address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          disabled={submitting}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="default_locale" className="text-sm font-medium text-text">
            Varsayılan dil
          </label>
          <select
            id="default_locale"
            value={defaultLocale}
            onChange={(e) =>
              setDefaultLocale(e.target.value as AdminLocaleCode)
            }
            disabled={submitting}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {ALL_LOCALES.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABEL[l]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Desteklenen diller</span>
          <div className="flex flex-wrap gap-2">
            {ALL_LOCALES.map((l) => {
              const checked = supportedLocales.includes(l);
              return (
                <label
                  key={l}
                  className={
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
                    (checked
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-muted hover:bg-background")
                  }
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLocale(l)}
                    disabled={submitting || (l === defaultLocale)}
                    className="sr-only"
                  />
                  {LOCALE_LABEL[l]}
                </label>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="currency" className="text-sm font-medium text-text">
            Para birimi
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            disabled={submitting}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold text-text">
          Görseller
        </h2>
        <p className="text-xs text-muted">
          Logo ve kapak görseli. Yükleme multipart üzerinden
          /api/v1/admin/media/upload endpoint&apos;ine gider. JPG / PNG /
          WEBP · maks. 5 MB (D-011 local MEDIA_ROOT).
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">Logo</span>
            <ImageUpload
              value={logoUrl}
              onUpload={(serverUrl) => setLogoUrl(serverUrl)}
              csrfToken={csrfToken}
              aspectClassName="aspect-square"
              alt={`${organization.name} logo`}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text">Kapak görseli</span>
            <ImageUpload
              value={coverUrl}
              onUpload={(serverUrl) => setCoverUrl(serverUrl)}
              csrfToken={csrfToken}
              aspectClassName="aspect-video"
              alt={`${organization.name} kapak görseli`}
            />
          </div>
        </div>
      </div>

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
              Değişiklikleri kaydet
            </>
          )}
        </button>
      </div>
    </form>
  );
}
