"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { FormField } from "../../_components/FormField";
import {
  createMenu,
  updateMenu,
  type CreateMenuPayload,
  type UpdateMenuPayload,
} from "@/lib/api-admin";
import type {
  AdminLocaleCode,
  AdminMenu,
  Organization,
} from "@/types/admin";

const ALL_LOCALES: AdminLocaleCode[] = ["tr", "en"];
const LOCALE_LABEL: Record<AdminLocaleCode, string> = {
  tr: "Türkçe",
  en: "English",
};

interface MenuFormProps {
  /** When editing, the existing menu. */
  menu?: AdminMenu;
  /** The current organization (used as default organization_id on create). */
  organization: Organization;
  /** CSRF token from the cookie (admin PATCH/POST requires it). */
  csrfToken: string | null;
}

/**
 * MenuForm — controlled client form for creating + editing a menu.
 *
 * Submit strategy:
 *   - On create: POST /api/v1/admin/menus/ with the full payload.
 *   - On edit:   PATCH /api/v1/admin/menus/{id}/ with only changed fields.
 *
 * The `slug` field is optional — if empty, the backend auto-generates one
 * from the name (D-012). We still expose it so the operator can pin a
 * stable URL (e.g. for marketing QR codes).
 */
export function MenuForm({ menu, organization, csrfToken }: MenuFormProps) {
  const router = useRouter();
  const isEdit = Boolean(menu);

  const [name, setName] = useState(menu?.name ?? "");
  const [slug, setSlug] = useState(menu?.slug ?? "");
  const [description, setDescription] = useState(menu?.description ?? "");
  const [defaultLocale, setDefaultLocale] = useState<AdminLocaleCode>(
    menu?.default_locale ?? "tr",
  );
  const [supportedLocales, setSupportedLocales] = useState<AdminLocaleCode[]>(
    menu?.supported_locales ?? ["tr"],
  );
  const [isActive, setIsActive] = useState(menu?.is_active ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleLocale = (locale: AdminLocaleCode) => {
    if (supportedLocales.includes(locale)) {
      // Don't allow toggling the default off.
      if (locale === defaultLocale) return;
      setSupportedLocales(supportedLocales.filter((l) => l !== locale));
    } else {
      setSupportedLocales([...supportedLocales, locale]);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Menü ismi zorunludur.");
      return;
    }
    if (supportedLocales.length === 0) {
      setError("En az bir dil seçilmelidir.");
      return;
    }
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && menu) {
        const payload: UpdateMenuPayload = {
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim(),
          default_locale: defaultLocale,
          supported_locales: supportedLocales,
          is_active: isActive,
        };
        await updateMenu(menu.id, payload, { csrfToken });
        router.push(`/admin/menus/${menu.id}`);
        router.refresh();
      } else {
        const payload: CreateMenuPayload = {
          organization_id: organization.id,
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim(),
          default_locale: defaultLocale,
          supported_locales: supportedLocales,
          is_active: isActive,
        };
        const created = await createMenu(payload, { csrfToken });
        router.push(`/admin/menus/${created.id}`);
        router.refresh();
      }
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Menü kaydedilemedi.";
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-text"
        >
          {error}
        </div>
      ) : null}

      <FormField
        label="Menü adı"
        name="name"
        value={name}
        onChange={setName}
        placeholder="Örnek: Ana Menü, Brunch Menüsü"
        required
        disabled={submitting}
      />

      <FormField
        label="URL kısa adı (slug)"
        name="slug"
        value={slug}
        onChange={setSlug}
        placeholder="Boş bırakırsanız isimden otomatik üretilir"
        hint="QR kodlar ve paylaşım için kullanılır. Küçük harf ve tire önerilir."
        disabled={submitting}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-text">
          Açıklama
        </label>
        <textarea
          id="description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Müşterilerin göreceği kısa açıklama (opsiyonel)"
          disabled={submitting}
          className="w-full rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text placeholder:text-outline focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text">Dil ayarları</legend>
        <p className="text-xs text-muted">
          Varsayılan dil zorunludur; desteklenen diğer diller daha sonra
          çeviri eklemenize olanak tanır.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="default_locale" className="text-xs font-medium text-text">
              Varsayılan dil
            </label>
            <select
              id="default_locale"
              name="default_locale"
              value={defaultLocale}
              onChange={(e) =>
                setDefaultLocale(e.target.value as AdminLocaleCode)
              }
              disabled={submitting}
              className="rounded-xl border border-input bg-surface px-3.5 py-2.5 text-base sm:text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
            >
              {ALL_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-text">Desteklenen diller</span>
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
        </div>
      </fieldset>

      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={submitting}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium text-text">Menü yayında</span>
        <span className="text-xs text-muted">
          (Yayındaysa müşterilerin erişimine açılır)
        </span>
      </label>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={submitting}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          Vazgeç
        </button>
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
              {isEdit ? "Değişiklikleri kaydet" : "Menüyü oluştur"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
