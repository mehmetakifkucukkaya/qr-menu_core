"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { FormField } from "@/app/(admin)/_components/FormField";
import { TranslationTabs, translationsToArray } from "@/app/(admin)/_components/TranslationTabs";
import { ImageUpload } from "@/app/(admin)/_components/ImageUpload";
import {
  createCategory,
  updateCategory,
  type CreateCategoryPayload,
  type UpdateCategoryPayload,
} from "@/lib/api-admin";
import type {
  AdminLocaleCode,
  AdminMenu,
  AdminMenuCategory,
  MenuTranslation,
} from "@/types/admin";

interface CategoryFormProps {
  menu: AdminMenu;
  /** When editing, the existing category. */
  category?: AdminMenuCategory;
  /** Available parent categories (excluding self for edit). */
  parentOptions: AdminMenuCategory[];
  /** CSRF token (admin POST/PATCH requires it). */
  csrfToken: string | null;
  /** Called after a successful save. */
  onSaved: (category: AdminMenuCategory) => void;
}

/**
 * CategoryForm — controlled client form for creating + editing a category.
 *
 * The translations field uses TranslationTabs to keep the TR/EN UX clean.
 * On submit we flatten the tabs value into a MenuTranslation[] array the
 * backend expects on POST/PATCH.
 *
 * Image upload:
 *   - V1 limitation (D-011): file upload needs multipart/form-data which
 *     our JSON admin client doesn't support. We display the preview and
 *     accept the File in component state, but for now the actual upload
 *     only lands when we add the multipart route in Sprint 5.
 */
export function CategoryForm({
  menu,
  category,
  parentOptions,
  csrfToken,
  onSaved,
}: CategoryFormProps) {
  const router = useRouter();
  const isEdit = Boolean(category);

  const initialTranslations: Partial<
    Record<AdminLocaleCode, { name: string; description?: string }>
  > = (() => {
    const map: Partial<Record<AdminLocaleCode, { name: string; description?: string }>> = {};
    map[menu.default_locale] = {
      name: category?.name ?? "",
      description: category?.description ?? "",
    };
    for (const t of category?.translations ?? []) {
      map[t.locale] = {
        name: t.name,
        description: t.description ?? "",
      };
    }
    return map;
  })();

  const [translations, setTranslations] = useState(initialTranslations);
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parentId, setParentId] = useState<number | null>(
    category?.parent_id ?? null,
  );
  const [sortOrder, setSortOrder] = useState<number>(category?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const translationsArray: MenuTranslation[] = translationsToArray(translations);
    if (translationsArray.length === 0) {
      setError(
        `En az "${menu.default_locale === "tr" ? "Türkçe" : "English"}" için isim girilmelidir.`,
      );
      return;
    }
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && category) {
        const payload: UpdateCategoryPayload = {
          name: translationsArray[0].name,
          slug: slug.trim() || undefined,
          parent_id: parentId,
          description: translationsArray[0].description ?? "",
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
          is_active: isActive,
          translations: translationsArray,
        };
        const updated = await updateCategory(category.id, payload, { csrfToken });
        onSaved(updated);
      } else {
        const payload: CreateCategoryPayload = {
          menu_id: menu.id,
          parent_id: parentId,
          name: translationsArray[0].name,
          slug: slug.trim() || undefined,
          description: translationsArray[0].description ?? "",
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
          is_active: isActive,
          translations: translationsArray,
        };
        const created = await createCategory(payload, { csrfToken });
        onSaved(created);
      }
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Kategori kaydedilemedi.";
      setError(msg);
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

      <TranslationTabs
        locales={menu.supported_locales}
        value={translations}
        onChange={setTranslations}
        descriptionLabel="Açıklama"
        nameLabel="Kategori adı"
        descriptionHint="Müşterilerin kategori listesinde göreceği açıklama (opsiyonel)."
      />

      <FormField
        label="URL kısa adı (slug)"
        name="slug"
        value={slug}
        onChange={setSlug}
        placeholder="Boş bırakırsanız isimden otomatik üretilir"
        hint="Kategori için kalıcı URL. Müşteri sayfasında kullanılmaz, sadece yönetim için."
        disabled={submitting}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="parent_id" className="text-sm font-medium text-text">
            Üst kategori
          </label>
          <select
            id="parent_id"
            name="parent_id"
            value={parentId ?? ""}
            onChange={(e) =>
              setParentId(e.target.value ? Number(e.target.value) : null)
            }
            disabled={submitting}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">— Yok (ana kategori) —</option>
            {parentOptions
              .filter((p) => p.id !== category?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted">
            İç içe kategoriler için (örn. Kahve / Türk Kahvesi). V1&apos;de basit
            liste tercih edebilirsiniz.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sort_order" className="text-sm font-medium text-text">
            Sıralama
          </label>
          <input
            id="sort_order"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) =>
              setSortOrder(Number.parseInt(e.target.value, 10) || 0)
            }
            disabled={submitting}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="text-xs text-muted">
            Düşük sayı önce gösterilir. Reorder butonlarıyla da değiştirilebilir.
          </p>
        </div>
      </div>

      <ImageUpload
        value={category?.image ?? null}
        onChange={({ file, preview }) => {
          setImageFile(file);
          setImagePreview(preview);
        }}
        alt={category?.name ?? "Kategori görseli"}
      />
      {imagePreview ? (
        <p className="text-xs italic text-muted">
          Yeni görsel seçildi (V1: multipart upload Sprint 5&apos;te).
        </p>
      ) : null}

      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={submitting}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-sm font-medium text-text">Kategori aktif</span>
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
              {isEdit ? "Değişiklikleri kaydet" : "Kategoriyi oluştur"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
