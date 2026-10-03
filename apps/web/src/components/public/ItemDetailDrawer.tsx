"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  Beef,
  Flame,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Star,
  Wine,
  Weight,
} from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { SmartImage } from "@/components/ui/SmartImage";
import { useCartStore } from "@/lib/cart-store";
import { useFeatureFlag } from "@/lib/feature-flags";
import { formatPrice } from "@/lib/format";
import type {
  LocaleCode,
  PublicMenuAllergen,
  PublicMenuDietaryTag,
  PublicMenuItem,
  Translation,
} from "@/types/menu";
import { pickTranslation } from "@/types/menu";

interface ItemDetailDrawerProps {
  item: PublicMenuItem | null;
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  locale: LocaleCode;
  onClose: () => void;
}

const TITLE_ID = "drawer-item-title";

/**
 * ItemDetailDrawer — a dish's full story in a bottom sheet (centered modal on
 * larger screens).
 *
 * - Opens when an ItemCard is tapped. Focus handling, Escape, tap-outside,
 *   drag-down-to-dismiss and the page lock all come from `Sheet`.
 * - A dish with a photo gets a hero image with a floating close button; a dish
 *   without one gets the standard header, so there is never an empty frame.
 * - The footer carries the price and an add-to-cart control (when the plan
 *   includes the cart) so the reader doesn't have to close the sheet and hunt
 *   for the card's button again.
 *
 * Sprint D1b — mevzuat (compliance) section. Optional fields from the backend
 * payload surface as chips / callouts: calories, portion size, alcohol, halal
 * status, ingredients and legal notes. Each subsection silently hides when its
 * source field is missing, so a non-compliant tenant renders a lean sheet.
 */
export function ItemDetailDrawer({
  item,
  allergens,
  dietaryTags,
  locale,
  onClose,
}: ItemDetailDrawerProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");
  const cartItem = useCartStore((s) =>
    item ? s.items.find((i) => i.menuItemId === item.id) : undefined,
  );
  const add = useCartStore((s) => s.add);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  if (!item) {
    return <Sheet open={false} onClose={onClose} ariaLabel="Ürün detayı">{null}</Sheet>;
  }

  // Resolve allergen / tag metadata from the global lists (they arrive
  // as { code, name: Translation } on the top-level payload).
  const allergenMeta = item.allergens
    .map((code) => allergens.find((a) => a.code === code))
    .filter(Boolean) as PublicMenuAllergen[];

  const tagMeta = item.dietary_tags
    .map((code) => dietaryTags.find((t) => t.code === code))
    // "popular" / "new" duplicate the badges below the title.
    .filter((t): t is PublicMenuDietaryTag => !!t && t.code !== "popular" && t.code !== "new");

  const hasCalories =
    typeof item.calories === "number" && Number.isFinite(item.calories);
  const hasPortion = !!(item.portion_size && item.portion_size.trim());
  const hasIngredients = !!(item.ingredients && item.ingredients.trim());
  const hasLegalNotes = !!(item.legal_notes && item.legal_notes.trim());
  const showAlcohol = item.contains_alcohol === true;
  const showHalal = item.is_halal === true || item.is_halal === false;
  const hasFacts = hasCalories || hasPortion || showHalal;

  // `default` = the requested translation is missing and the venue's own
  // language is shown instead — worth a quiet note so it isn't mistaken for a bug.
  const showFallbackNote = item.locale_used === "default";

  const hasImage = Boolean(item.image);
  const price = formatPrice(item.price, item.currency);
  const comparePrice =
    item.compare_at_price &&
    Number.parseFloat(item.compare_at_price) > Number.parseFloat(item.price)
      ? formatPrice(item.compare_at_price, item.currency)
      : null;

  const handleAdd = () => {
    onClose();
    add(
      {
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        currency: item.currency,
        image: item.image ?? null,
      },
      1,
    );
  };

  return (
    <Sheet
      open
      onClose={onClose}
      ariaLabelledBy={hasImage ? TITLE_ID : undefined}
      floatingClose={hasImage}
      title={hasImage ? undefined : item.name}
      bodyClassName="p-0"
      footer={
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-heading text-2xl font-semibold tabular-nums leading-none text-primary">
              {price}
            </p>
            {comparePrice ? (
              <s className="mt-1 block text-sm tabular-nums text-outline">
                {comparePrice}
              </s>
            ) : null}
          </div>

          {cartEnabled ? (
            cartItem ? (
              <div
                role="group"
                aria-label={`${item.name} adedi`}
                className="flex h-12 items-center rounded-pill bg-surface-low ring-1 ring-border-strong"
              >
                <button
                  type="button"
                  aria-label="Azalt"
                  onClick={() => updateQuantity(item.id, cartItem.quantity - 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition hover:bg-surface-high active:scale-90"
                >
                  <Minus className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </button>
                <span
                  aria-live="polite"
                  className="min-w-[1.75rem] text-center text-base font-bold tabular-nums"
                >
                  {cartItem.quantity}
                </span>
                <button
                  type="button"
                  aria-label="Arttır"
                  onClick={() => updateQuantity(item.id, cartItem.quantity + 1)}
                  className="flex h-12 w-12 items-center justify-center rounded-full text-primary transition hover:bg-surface-high active:scale-90"
                >
                  <Plus className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </button>
              </div>
            ) : (
              <Button
                size="lg"
                onClick={handleAdd}
                leadingIcon={<ShoppingBag className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
              >
                Sepete Ekle
              </Button>
            )
          ) : null}
        </div>
      }
    >
      {hasImage ? (
        <SmartImage
          src={item.image}
          alt={item.name}
          loading="eager"
          wrapperClassName="h-60 w-full sm:h-64"
        />
      ) : null}

      <div className="space-y-5 px-5 py-5">
        <div>
          {item.is_featured || item.is_popular || item.is_new || showFallbackNote ? (
            <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
              {item.is_featured ? (
                <Badge tone="primary" icon={<Star className="h-3 w-3" aria-hidden />}>
                  İmza
                </Badge>
              ) : null}
              {item.is_popular ? (
                <Badge tone="warm" icon={<Flame className="h-3 w-3" aria-hidden />}>
                  Popüler
                </Badge>
              ) : null}
              {item.is_new ? (
                <Badge tone="success" icon={<Sparkles className="h-3 w-3" aria-hidden />}>
                  Yeni
                </Badge>
              ) : null}
              {showFallbackNote ? (
                <Badge tone="neutral">Bu dilde çeviri yok</Badge>
              ) : null}
            </div>
          ) : null}

          {/* With a photo the title lives here (the Sheet has no header then);
              without one the Sheet header already shows it. */}
          {hasImage ? (
            <h2
              id={TITLE_ID}
              className="font-heading text-[1.65rem] font-semibold leading-tight tracking-tight text-text"
            >
              {item.name}
            </h2>
          ) : null}

          {item.description ? (
            <p className={clsx("text-base leading-relaxed text-muted", hasImage && "mt-2")}>
              {item.description}
            </p>
          ) : (
            <p className="text-sm italic text-outline">Açıklama bulunmuyor.</p>
          )}
        </div>

        {hasFacts ? (
          <ul className="flex flex-wrap gap-2" aria-label="Ürün bilgileri">
            {hasCalories ? (
              <Fact icon={<Flame className="h-4 w-4" aria-hidden />}>
                {item.calories} kcal
              </Fact>
            ) : null}
            {hasPortion ? (
              <Fact icon={<Weight className="h-4 w-4" aria-hidden />}>
                {item.portion_size}
              </Fact>
            ) : null}
            {showHalal && item.is_halal === true ? (
              <Fact tone="success" icon={<Beef className="h-4 w-4" aria-hidden />}>
                Helal
              </Fact>
            ) : null}
            {showHalal && item.is_halal === false ? (
              <Fact tone="danger" icon={<Beef className="h-4 w-4" aria-hidden />}>
                Helal değil
              </Fact>
            ) : null}
          </ul>
        ) : null}

        {showAlcohol ? (
          <Callout
            tone="warning"
            icon={<Wine className="h-5 w-5" aria-hidden />}
            label="Alkol uyarısı"
          >
            <p className="font-semibold">Alkol içerir</p>
          </Callout>
        ) : null}

        {hasLegalNotes ? (
          <Callout
            tone={isAllergenNote(item.legal_notes!) ? "danger" : "warning"}
            icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
            label="Yasal uyarı"
          >
            <p className="font-semibold">Yasal not</p>
            <p className="mt-0.5 leading-snug">{item.legal_notes}</p>
          </Callout>
        ) : null}

        {allergenMeta.length > 0 ? (
          <Section title="Alerjenler">
            <ul className="flex flex-wrap gap-2">
              {allergenMeta.map((a) => (
                <li key={a.code}>
                  <Badge
                    tone="warning"
                    size="md"
                    icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                  >
                    {pickTranslation(a.name as Translation, locale)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {tagMeta.length > 0 ? (
          <Section title="Diyet etiketleri">
            <ul className="flex flex-wrap gap-2">
              {tagMeta.map((t) => (
                <li key={t.code}>
                  <Badge
                    tone="success"
                    size="md"
                    icon={<Leaf className="h-3.5 w-3.5" aria-hidden />}
                  >
                    {pickTranslation(t.name as Translation, locale)}
                  </Badge>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {hasIngredients ? (
          <Section title="İçindekiler">
            <ul className="flex flex-wrap gap-1.5">
              {item.ingredients!
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .map((ing, idx) => (
                  <li
                    key={`${ing}-${idx}`}
                    className="rounded-pill bg-surface-low px-3 py-1 text-sm text-text"
                  >
                    {ing}
                  </li>
                ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </Sheet>
  );
}

/** True when the legal_notes string mentions alerjen / alerji — used to
 *  pick the red tone (allergen warning) vs the amber tone (general
 *  compliance note). Case-insensitive substring match. */
function isAllergenNote(text: string): boolean {
  const lower = text.toLocaleLowerCase("tr-TR");
  return lower.includes("alerjen") || lower.includes("alerji");
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 font-body text-sm font-semibold text-text">{title}</h3>
      {children}
    </section>
  );
}

function Fact({
  icon,
  tone = "neutral",
  children,
}: {
  icon: ReactNode;
  tone?: "neutral" | "success" | "danger";
  children: ReactNode;
}) {
  return (
    <li
      className={clsx(
        "inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-sm font-semibold",
        tone === "neutral" && "bg-surface-low text-text",
        tone === "success" && "bg-success-soft text-success",
        tone === "danger" && "bg-danger-soft text-danger",
      )}
    >
      {icon}
      {children}
    </li>
  );
}

function Callout({
  tone,
  icon,
  label,
  children,
}: {
  tone: "warning" | "danger";
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="note"
      aria-label={label}
      className={clsx(
        "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm",
        tone === "warning" ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
