"use client";

import { useEffect, useRef } from "react";
import { X, Flame, Wine, Beef } from "lucide-react";
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
 *
 * Sprint D1b — adds the mevzuat (compliance) section. Six optional
 * fields from the backend payload surface as badges / callouts:
 *   - calories    → "🔥 350 kcal" badge (Flame icon)
 *   - portion_size → "📏 250g"   badge
 *   - contains_alcohol true → amber callout "🍷 Alkol içerir"
 *   - is_halal    true / false / null → green / red / hidden badge
 *   - ingredients → comma-separated chip list
 *   - legal_notes → callout (red border if mentions alerjen, else amber)
 * Each subsection silently hides when its source field is missing so
 * a non-compliant tenant renders an unchanged drawer.
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

  // Sprint D1b — derive compliance-view-model flags once so the
  // mevzuat section can early-return cleanly when no data is present.
  const hasCalories =
    typeof item.calories === "number" && Number.isFinite(item.calories);
  const hasPortion = !!(item.portion_size && item.portion_size.trim());
  const hasIngredients = !!(item.ingredients && item.ingredients.trim());
  const hasLegalNotes = !!(item.legal_notes && item.legal_notes.trim());
  const showAlcohol = item.contains_alcohol === true;
  const showHalal = item.is_halal === true || item.is_halal === false;
  const hasAnyCompliance =
    hasCalories ||
    hasPortion ||
    hasIngredients ||
    hasLegalNotes ||
    showAlcohol ||
    showHalal;

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
          {/* Hero image — only when an image URL is present. The drawer
              never breaks layout when the source DB has no image. */}
          {item.image ? (
            <div className="mb-4 overflow-hidden rounded-lg bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt={item.name}
                loading="lazy"
                decoding="async"
                className="h-40 w-full object-cover sm:h-48"
              />
            </div>
          ) : null}

          {item.description ? (
            <p className="text-sm text-text sm:text-base">{item.description}</p>
          ) : (
            <p className="text-sm italic text-muted">Açıklama bulunmuyor.</p>
          )}

          {/* Sprint D1b — mevzuat bölümü. Renders only when at least one
              of the six compliance fields is present. Each subsection
              independently hides when its field is missing. */}
          {hasAnyCompliance ? (
            <section
              aria-label="Mevzuat bilgileri"
              className="mt-5 rounded-xl border border-border bg-background/40 p-3"
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Mevzuat bilgileri
              </h3>

              <div className="flex flex-wrap gap-2">
                {hasCalories ? (
                  <span
                    title={`${item.calories} kalori (kcal)`}
                    className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-900 ring-1 ring-orange-200"
                  >
                    <Flame className="h-3.5 w-3.5" aria-hidden />
                    <span aria-hidden>🔥</span>
                    <span>{item.calories} kcal</span>
                  </span>
                ) : null}

                {hasPortion ? (
                  <span
                    title={`Porsiyon: ${item.portion_size}`}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-900 ring-1 ring-slate-200"
                  >
                    <span aria-hidden>📏</span>
                    <span>{item.portion_size}</span>
                  </span>
                ) : null}

                {showHalal && item.is_halal === true ? (
                  <span
                    title="Helal"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200"
                  >
                    <Beef className="h-3.5 w-3.5" aria-hidden />
                    <span>Helal</span>
                  </span>
                ) : null}
                {showHalal && item.is_halal === false ? (
                  <span
                    title="Helal Değil"
                    className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-900 ring-1 ring-rose-200"
                  >
                    <Beef className="h-3.5 w-3.5" aria-hidden />
                    <span>Helal Değil</span>
                  </span>
                ) : null}
              </div>

              {/* Alkol callout — amber, full-width, sits inside the
                  mevzuat card so it reads as a compliance warning. */}
              {showAlcohol ? (
                <div
                  role="note"
                  aria-label="Alkol uyarısı"
                  className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 sm:text-sm"
                >
                  <Wine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>🍷 Alkol içerir</span>
                </div>
              ) : null}

              {/* Ingredients chips — comma-separated source string. */}
              {hasIngredients ? (
                <div className="mt-3">
                  <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                    İçindekiler
                  </h4>
                  <ul className="flex flex-wrap gap-1.5">
                    {item.ingredients!
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .map((ing, idx) => (
                        <li
                          key={`${ing}-${idx}`}
                          className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-text ring-1 ring-border"
                        >
                          {ing}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              {/* Legal notes — red border if mentions alerjen/alerji,
                  otherwise amber. Free-text, server-supplied. */}
              {hasLegalNotes ? (
                <div
                  role="note"
                  aria-label="Yasal uyarı"
                  className={
                    "mt-3 rounded-lg border px-3 py-2 text-xs sm:text-sm " +
                    (isAllergenNote(item.legal_notes!)
                      ? "border-rose-300 bg-rose-50 text-rose-900"
                      : "border-amber-300 bg-amber-50 text-amber-900")
                  }
                >
                  <p className="font-semibold">Yasal not</p>
                  <p className="mt-0.5 leading-snug">{item.legal_notes}</p>
                </div>
              ) : null}
            </section>
          ) : null}

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

/** True when the legal_notes string mentions alerjen / alerji — used to
 *  pick the red border tone (allergen warning) vs the amber tone
 *  (general compliance note). Case-insensitive substring match. */
function isAllergenNote(text: string): boolean {
  const lower = text.toLocaleLowerCase("tr-TR");
  return lower.includes("alerjen") || lower.includes("alerji");
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