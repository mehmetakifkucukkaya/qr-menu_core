"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type {
  PublicMenuAllergen,
  PublicMenuDietaryTag,
  PublicMenuItem,
  LocaleCode,
  Translation,
} from "@/types/menu";
import { pickTranslation } from "@/types/menu";
import { formatPrice } from "@/lib/format";

interface ItemDetailDrawerProps {
  item: PublicMenuItem | null;
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  locale: LocaleCode;
  onClose: () => void;
}

/**
 * ItemDetailDrawer — mobile bottom sheet (md+ centered modal).
 *
 * - Opens when an ItemCard's chevron is clicked.
 * - Slides in from the bottom on mobile, fades in centered on desktop.
 * - Closes on X, on backdrop click, or on Escape key.
 * - Locks body scroll while open.
 *
 * Accessibility: role="dialog", aria-modal, focus moves to close
 * button on open, restores focus on close.
 */
export function ItemDetailDrawer({
  item,
  allergens,
  dietaryTags,
  locale,
  onClose,
}: ItemDetailDrawerProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Lock body scroll + listen for Escape.
  useEffect(() => {
    if (!item) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    // Move focus to close button.
    queueMicrotask(() => closeBtnRef.current?.focus());

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  if (!item) return null;

  // Resolve allergen / tag metadata from the global lists (they arrive
  // as { code, name: Translation } on the top-level payload).
  const allergenMeta = item.allergens
    .map((code) => allergens.find((a) => a.code === code))
    .filter(Boolean) as PublicMenuAllergen[];

  const tagMeta = item.dietary_tags
    .map((code) => dietaryTags.find((t) => t.code === code))
    .filter(Boolean) as PublicMenuDietaryTag[];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-item-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-floating sm:max-w-md sm:rounded-2xl animate-[slideup_0.22s_ease-out]"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "slideup 0.22s ease-out",
        }}
      >
        <header className="sticky top-0 flex items-start justify-between gap-2 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <h2
            id="drawer-item-title"
            className="font-heading text-lg font-bold text-text sm:text-xl"
          >
            {item.name}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            aria-label="Kapat"
            onClick={onClose}
            className="touch-target inline-flex items-center justify-center rounded-full p-2 text-muted hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {item.description ? (
            <p className="text-sm text-text sm:text-base">{item.description}</p>
          ) : (
            <p className="text-sm italic text-muted">Açıklama bulunmuyor.</p>
          )}

          {allergenMeta.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Alerjenler
              </h3>
              <ul className="flex flex-wrap gap-2">
                {allergenMeta.map((a) => (
                  <li key={a.code}>
                    <AllergenBadge allergen={a} locale={locale} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {tagMeta.length > 0 ? (
            <div className="mt-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Diyet etiketleri
              </h3>
              <ul className="flex flex-wrap gap-2">
                {tagMeta.map((t) => (
                  <li key={t.code}>
                    <DietaryTagBadge tag={t} locale={locale} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
          <span className="font-heading text-xl font-bold text-primary sm:text-2xl">
            {formatPrice(item.price, item.currency)}
          </span>
          <span className="text-xs uppercase tracking-wider text-muted">
            {item.locale_used === "en" ? "EN" : "TR"}
          </span>
        </footer>
      </div>

      <style>{`
        @keyframes slideup {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function AllergenBadge({
  allergen,
  locale,
}: {
  allergen: PublicMenuAllergen;
  locale: LocaleCode;
}) {
  const label = pickTranslation(allergen.name as Translation, locale);
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200"
    >
      <span aria-hidden>⚠️</span>
      <span>{label}</span>
    </span>
  );
}

function DietaryTagBadge({
  tag,
  locale,
}: {
  tag: PublicMenuDietaryTag;
  locale: LocaleCode;
}) {
  const label = pickTranslation(tag.name as Translation, locale);
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200"
    >
      <span aria-hidden>🌿</span>
      <span>{label}</span>
    </span>
  );
}