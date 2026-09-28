"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { FormField } from "@/app/(admin)/_components/FormField";
import { TranslationTabs, translationsToArray } from "@/app/(admin)/_components/TranslationTabs";
import { AllergenSelector } from "@/app/(admin)/_components/AllergenSelector";
import { DietaryTagSelector } from "@/app/(admin)/_components/DietaryTagSelector";
import { ImageUpload } from "@/app/(admin)/_components/ImageUpload";
import {
  createItem,
  updateItem,
  type CreateItemPayload,
  type UpdateItemPayload,
} from "@/lib/api-admin";
import type {
  AdminLocaleCode,
  AdminMenu,
  AdminMenuCategory,
  AdminMenuItem,
  Allergen,
  DietaryTag,
  MenuTranslation,
} from "@/types/admin";

const SPICE_LABELS: Record<number, string> = {
  0: "Yok",
  1: "Hafif",
  2: "Orta",
  3: "Acılı",
};

const CURRENCY_OPTIONS = ["TRY", "EUR", "USD", "GBP"];

interface ItemFormProps {
  menu: AdminMenu;
  category: AdminMenuCategory;
  /** When editing, the existing item. */
  item?: AdminMenuItem;
  /** Reference data for the allergen / dietary tag selectors. */
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
  /** CSRF token. */
  csrfToken: string | null;
  /** Called after a successful save. */
  onSaved: (item: AdminMenuItem) => void;
}

/**
 * ItemForm — the heart of the items management flow.
 *
 * Fields:
 *   - name + description (TranslationTabs TR/EN)
 *   - price + compare_at_price + currency
 *   - image (preview only in V1 — see ImageUpload)
 *   - allergens + dietary_tags (multi-select chips)
 *   - is_active / is_available / is_featured / is_popular / is_new
 *   - spice_level (0-3 dropdown) + sort_order
 *
 * On submit we POST/PATCH and the parent redirects.
 */
export function ItemForm({
  menu,
  category,
  item,
  allergens,
  dietaryTags,
  csrfToken,
  onSaved,
}: ItemFormProps) {
  const router = useRouter();
  const isEdit = Boolean(item);

  const initialTranslations: Partial<
    Record<AdminLocaleCode, { name: string; description?: string }>
  > = (() => {
    const map: Partial<Record<AdminLocaleCode, { name: string; description?: string }>> = {};
    map[menu.default_locale] = {
      name: item?.name ?? "",
      description: item?.description ?? "",
    };
    for (const t of item?.translations ?? []) {
      map[t.locale] = {
        name: t.name,
        description: t.description ?? "",
      };
    }
    return map;
  })();

  const [translations, setTranslations] = useState(initialTranslations);
  const [price, setPrice] = useState<string>(item?.price ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState<string>(
    item?.compare_at_price ?? "",
  );
  const [currency, setCurrency] = useState<string>(item?.currency ?? "TRY");
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [isAvailable, setIsAvailable] = useState(item?.is_available ?? true);
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [isPopular, setIsPopular] = useState(item?.is_popular ?? false);
  const [isNew, setIsNew] = useState(item?.is_new ?? false);
  const [spiceLevel, setSpiceLevel] = useState<number>(item?.spice_level ?? 0);
  const [sortOrder, setSortOrder] = useState<number>(item?.sort_order ?? 0);
  const [allergenIds, setAllergenIds] = useState<number[]>(
    item?.allergen_ids ?? [],
  );
  const [dietaryTagIds, setDietaryTagIds] = useState<number[]>(
    item?.dietary_tag_ids ?? [],
  );
  const [imageUrl, setImageUrl] = useState<string | null>(item?.image ?? null);

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
    if (!price.trim()) {
      setError("Fiyat zorunludur.");
      return;
    }
    const normalizedPrice = price.trim().replace(",", ".");
    const priceNum = Number.parseFloat(normalizedPrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Geçerli bir pozitif fiyat girin.");
      return;
    }
    let normalizedCompare: string | null = null;
    if (compareAtPrice.trim()) {
      const c = Number.parseFloat(compareAtPrice.trim().replace(",", "."));
      if (!Number.isFinite(c) || c < 0) {
        setError("Karşılaştırma fiyatı geçersiz.");
        return;
      }
      if (c < priceNum) {
        setError("Karşılaştırma fiyatı, asıl fiyattan düşük olamaz.");
        return;
      }
      normalizedCompare = c.toFixed(2);
    }
    if (!csrfToken) {
      setError("CSRF token eksik. Sayfayı yenileyin.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && item) {
        const payload: UpdateItemPayload = {
          name: translationsArray[0].name,
          description: translationsArray[0].description ?? "",
          price: priceNum.toFixed(2),
          compare_at_price: normalizedCompare,
          currency,
          is_active: isActive,
          is_available: isAvailable,
          is_featured: isFeatured,
          is_popular: isPopular,
          is_new: isNew,
          spice_level: spiceLevel,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
          allergen_ids: allergenIds,
          dietary_tag_ids: dietaryTagIds,
          image: imageUrl ?? "",
          translations: translationsArray,
        };
        const updated = await updateItem(item.id, payload, { csrfToken });
        onSaved(updated);
      } else {
        const payload: CreateItemPayload = {
          menu_id: menu.id,
          category_id: category.id,
          name: translationsArray[0].name,
          description: translationsArray[0].description ?? "",
          price: priceNum.toFixed(2),
          compare_at_price: normalizedCompare,
          currency,
          is_active: isActive,
          is_available: isAvailable,
          is_featured: isFeatured,
          is_popular: isPopular,
          is_new: isNew,
          spice_level: spiceLevel,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
          allergen_ids: allergenIds,
          dietary_tag_ids: dietaryTagIds,
          image: imageUrl ?? "",
          translations: translationsArray,
        };
        const created = await createItem(payload, { csrfToken });
        onSaved(created);
      }
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Ürün kaydedilemedi.";
      setError(msg);
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm text-text"
        >
          {error}
        </div>
      ) : null}

      {/* Names + descriptions */}
      <section aria-label="İsim ve açıklama" className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-text">
          İsim ve açıklama
        </h2>
        <TranslationTabs
          locales={menu.supported_locales}
          value={translations}
          onChange={setTranslations}
          descriptionLabel="Açıklama"
          nameLabel="Ürün adı"
          descriptionHint="Müşterilerin ürün kartında göreceği kısa açıklama."
          ai={
            item
              ? { entityType: "menu_item", entityId: item.id, csrfToken }
              : null
          }
        />
      </section>

      {/* Pricing */}
      <section
        aria-label="Fiyat"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <FormField
          label="Fiyat"
          name="price"
          type="text"
          value={price}
          onChange={setPrice}
          placeholder="örn. 89.50"
          required
          hint="Ondalıkta nokta veya virgül kullanabilirsiniz; sunucu 2 ondalığa yuvarlar."
          disabled={submitting}
        />
        <FormField
          label="Karşılaştırma fiyatı"
          name="compare_at_price"
          type="text"
          value={compareAtPrice}
          onChange={setCompareAtPrice}
          placeholder="(opsiyonel)"
          hint="İndirimli ürünlerde eski fiyat."
          disabled={submitting}
        />
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
      </section>

      {/* Image */}
      <section aria-label="Görsel" className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-text">Görsel</h2>
        <ImageUpload
          value={item?.image ?? null}
          onUpload={(serverUrl) => setImageUrl(serverUrl)}
          csrfToken={csrfToken}
          alt={item?.name ?? "Ürün görseli"}
        />
        {imageUrl && imageUrl !== (item?.image ?? null) ? (
          <p className="text-xs italic text-muted">
            Yeni görsel yüklendi — kaydet butonuna basınca ürüne işlenir.
          </p>
        ) : null}
      </section>

      {/* Allergens */}
      <section aria-label="Alerjenler" className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-text">
          Alerjenler
        </h2>
        <p className="text-xs text-muted">
          Bu üründe bulunan alerjenleri seçin. Müşterilere bilgi amaçlıdır.
        </p>
        <AllergenSelector
          allergens={allergens}
          value={allergenIds}
          onChange={setAllergenIds}
          locale={menu.default_locale}
          disabled={submitting}
        />
      </section>

      {/* Dietary tags */}
      <section aria-label="Diyet etiketleri" className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-semibold text-text">
          Diyet etiketleri
        </h2>
        <DietaryTagSelector
          tags={dietaryTags}
          value={dietaryTagIds}
          onChange={setDietaryTagIds}
          locale={menu.default_locale}
          disabled={submitting}
        />
      </section>

      {/* Flags + sort + spice */}
      <section aria-label="Durum" className="flex flex-col gap-3">
        <h2 className="font-heading text-base font-semibold text-text">Durum</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <CheckboxRow
            label="Aktif"
            hint="Müşteri menüsünde görünür."
            checked={isActive}
            disabled={submitting}
            onChange={setIsActive}
          />
          <CheckboxRow
            label="Stokta var"
            hint="Tükendiğinde geçici olarak gizleyin."
            checked={isAvailable}
            disabled={submitting}
            onChange={setIsAvailable}
          />
          <CheckboxRow
            label="Öne çıkan"
            hint="Vitrin / spotlight bölümünde gösterilir."
            checked={isFeatured}
            disabled={submitting}
            onChange={setIsFeatured}
          />
          <CheckboxRow
            label="Popüler"
            hint="Sıkça tercih edilenler rozeti."
            checked={isPopular}
            disabled={submitting}
            onChange={setIsPopular}
          />
          <CheckboxRow
            label="Yeni"
            hint="Yeni eklenen ürün rozeti."
            checked={isNew}
            disabled={submitting}
            onChange={setIsNew}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="spice_level" className="text-sm font-medium text-text">
              Acı seviyesi
            </label>
            <select
              id="spice_level"
              value={spiceLevel}
              onChange={(e) => setSpiceLevel(Number.parseInt(e.target.value, 10))}
              disabled={submitting}
              className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {Object.entries(SPICE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>
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
            className="w-32 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </section>

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
              {isEdit ? "Değişiklikleri kaydet" : "Ürünü oluştur"}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function CheckboxRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface px-3 py-2 transition hover:bg-background">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium text-text">{label}</span>
        {hint ? (
          <span className="text-xs text-muted">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
