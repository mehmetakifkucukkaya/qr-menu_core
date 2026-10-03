import { notFound } from "next/navigation";

import { fetchPublicMenu, PublicMenuError } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { mediaSrc } from "@/lib/media-url";
import { humanizeSlug } from "@/lib/format";
import type { LocaleCode } from "@/types/menu";
import type { PublicMenuCategory, PublicMenuItem } from "@/types/menu";

import "@/styles/print.css";

interface PageProps {
  params: { businessSlug: string };
  searchParams: { locale?: string; branch?: string };
}

const DEFAULT_LOCALE: LocaleCode =
  (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as LocaleCode) || "tr";

function resolveLocale(raw?: string): LocaleCode {
  return raw === "en" || raw === "tr" ? raw : DEFAULT_LOCALE;
}

/**
 * Printable menu page — Sprint D2 (frontend export).
 *
 * Server component that re-uses the same backend payload as the public
 * menu page (`fetchPublicMenu`) and renders an A4-friendly, print-only
 * layout. The CSS in `styles/print.css` collapses chrome (header,
 * footer, drawer, banners) and forces one category per page when the
 * user invokes the browser print dialog.
 *
 * Why a separate route (not just a CSS @media print on the main page)?
 *   - Print rendering doesn't need the client interactivity (cart,
 *     drawer, locale switcher) so a server component is smaller and
 *     faster to print.
 *   - Operators can bookmark or link directly to /m/<slug>/print for
 *     kiosk / wall display workflows.
 *   - The `?auto=1` query param is a convenience for "open print
 *     dialog on load" — useful for staff tablets.
 *
 * Browser print dialog is triggered client-side by the `PrintButton`
 * component mounted on the main public menu page; the print route
 * itself does not call `window.print()` server-side (impossible —
 * server has no DOM).
 *
 * V2 SaaS upgrade: a backend `/api/v1/public/menus/<slug>/pdf` endpoint
 * will replace this printable HTML page with a generated PDF. The
 * data contract here is identical so the V1 frontend keeps working
 * after the cut-over.
 */
export default async function PublicMenuPrintPage({
  params,
  searchParams,
}: PageProps) {
  const locale = resolveLocale(searchParams.locale);
  const branch = searchParams.branch;

  let payload;
  try {
    payload = await fetchPublicMenu(params.businessSlug, {
      locale,
      branch,
      internal: true,
    });
  } catch (err) {
    if (err instanceof PublicMenuError && err.status === 404) notFound();
    throw err;
  }

  const { business, categories, allergens, dietary_tags } = payload;

  return (
    <main
      lang={locale}
      className="print-root mx-auto max-w-[210mm] bg-white px-6 py-8 text-slate-900"
    >
      <header className="print-header mb-8 flex items-center gap-4 border-b border-slate-300 pb-4">
        {business.logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaSrc(business.logo) ?? undefined}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-slate-300"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xl font-bold text-white"
          >
            {business.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-heading text-2xl font-bold leading-tight">
            {business.name}
          </h1>
          {business.address ? (
            <p className="mt-0.5 truncate text-sm text-slate-600">
              {business.address}
            </p>
          ) : null}
          {business.phone || business.email ? (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {business.phone ? `Tel: ${business.phone}` : ""}
              {business.phone && business.email ? " · " : ""}
              {business.email ?? ""}
            </p>
          ) : null}
        </div>
      </header>

      {categories.length === 0 ||
      categories.every((c) => c.items.length === 0) ? (
        <p className="py-12 text-center text-sm text-slate-500">
          Bu işletmenin aktif menüsü şu an boş.
        </p>
      ) : (
        <div className="space-y-8">
          {categories.map((category) => (
            <CategoryPrintSection
              key={category.id}
              category={category}
              allergens={allergens}
              dietaryTags={dietary_tags}
            />
          ))}
        </div>
      )}

      <footer className="print-footer mt-10 border-t border-slate-300 pt-3 text-center text-[10px] uppercase tracking-wider text-slate-500">
        <p>
          {business.name} ·{" "}
          {new Date().toLocaleString(locale === "en" ? "en-GB" : "tr-TR", {
            dateStyle: "long",
            timeStyle: "short",
          })}
          {" · "}
          <span className="font-semibold">QR Menü</span>
        </p>
      </footer>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps) {
  return {
    title: `${humanizeSlug(params.businessSlug)} · Yazdırılabilir Menü`,
    robots: { index: false, follow: false },
  };
}

interface CategoryPrintSectionProps {
  category: PublicMenuCategory;
  allergens: import("@/types/menu").PublicMenuAllergen[];
  dietaryTags: import("@/types/menu").PublicMenuDietaryTag[];
}

/**
 * CategoryPrintSection — one printed section per category.
 *
 * `break-before: page` is applied via the `.print-category` class in
 * `styles/print.css`, so each category starts on its own page in the
 * rendered PDF / printed output. Inline-style fallback below (used
 * when CSS is stripped) keeps the visual structure on screen too.
 */
function CategoryPrintSection({
  category,
  allergens,
  dietaryTags,
}: CategoryPrintSectionProps) {
  if (category.items.length === 0) return null;
  return (
    <section
      aria-labelledby={`print-category-${category.id}-title`}
      className="print-category"
      style={{ breakBefore: "page", pageBreakBefore: "always" }}
    >
      <header className="mb-3 border-b border-slate-200 pb-2">
        <h2
          id={`print-category-${category.id}-title`}
          className="font-heading text-xl font-bold uppercase tracking-wide text-slate-900"
        >
          {category.name}
        </h2>
        {category.description ? (
          <p className="mt-0.5 text-xs italic text-slate-600">
            {category.description}
          </p>
        ) : null}
      </header>
      <ul className="space-y-3">
        {category.items.map((item) => (
          <li key={item.id} className="break-inside-avoid">
            <ItemPrintRow
              item={item}
              allergens={allergens}
              dietaryTags={dietaryTags}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ItemPrintRowProps {
  item: PublicMenuItem;
  allergens: import("@/types/menu").PublicMenuAllergen[];
  dietaryTags: import("@/types/menu").PublicMenuDietaryTag[];
}

/**
 * ItemPrintRow — single line on the print page.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────┐
 *   │ Name (bold)               Price (right-aligned) │
 *   │ Description (gray, small)                       │
 *   │ [🔥 350 kcal] [📏 250g] [🍷 Alkol] [Helal]      │
 *   │ Alerjenler: gluten, süt                         │
 *   │ Yasal not: ... (only if present)                │
 *   └─────────────────────────────────────────────────┘
 *
 * Compliance chips + legal-notes block are hidden when their source
 * fields are missing so empty tenants render an unchanged page.
 */
function ItemPrintRow({
  item,
  allergens,
  dietaryTags,
}: ItemPrintRowProps) {
  const allergenLabels = item.allergens
    .map((code) => allergens.find((a) => a.code === code))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) =>
      a && a.name && typeof a.name === "object"
        ? (a.name.tr ?? a.name.en ?? a.code)
        : a.code,
    );

  const tagLabels = item.dietary_tags
    .map((code) => dietaryTags.find((t) => t.code === code))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) =>
      t && t.name && typeof t.name === "object"
        ? (t.name.tr ?? t.name.en ?? t.code)
        : t.code,
    );

  const hasCalories =
    typeof item.calories === "number" && Number.isFinite(item.calories);
  const hasPortion = !!(item.portion_size && item.portion_size.trim());
  const showAlcohol = item.contains_alcohol === true;
  const showHalal = item.is_halal === true || item.is_halal === false;

  const ingredientList =
    item.ingredients && item.ingredients.trim()
      ? item.ingredients
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  const hasLegalNotes = !!(item.legal_notes && item.legal_notes.trim());

  return (
    <article className="border-b border-dotted border-slate-200 pb-2 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-heading text-sm font-bold leading-snug text-slate-900">
          {item.name}
        </h3>
        <span className="shrink-0 font-heading text-sm font-bold tabular-nums text-slate-900">
          {formatPrice(item.price, item.currency)}
        </span>
      </div>
      {item.description ? (
        <p className="mt-0.5 text-xs leading-snug text-slate-600">
          {item.description}
        </p>
      ) : null}

      {/* Mevzuat chip strip — kcal, portion, alcohol, halal. */}
      {hasCalories || hasPortion || showAlcohol || showHalal ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
          {hasCalories ? (
            <li className="rounded-full bg-orange-100 px-1.5 py-0.5 text-orange-900">
              🔥 {item.calories} kcal
            </li>
          ) : null}
          {hasPortion ? (
            <li className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-700">
              📏 {item.portion_size}
            </li>
          ) : null}
          {showAlcohol ? (
            <li className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-900">
              🍷 Alkol
            </li>
          ) : null}
          {showHalal && item.is_halal === true ? (
            <li className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-900">
              Helal
            </li>
          ) : null}
          {showHalal && item.is_halal === false ? (
            <li className="rounded-full bg-rose-100 px-1.5 py-0.5 text-rose-900">
              Helal Değil
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* Allergens + dietary tags — single line each, comma-separated. */}
      {allergenLabels.length > 0 ? (
        <p className="mt-1 text-[11px] text-slate-700">
          <span className="font-semibold">Alerjenler:</span>{" "}
          {allergenLabels.join(", ")}
        </p>
      ) : null}
      {tagLabels.length > 0 ? (
        <p className="mt-0.5 text-[11px] text-slate-700">
          <span className="font-semibold">Etiketler:</span>{" "}
          {tagLabels.join(", ")}
        </p>
      ) : null}

      {/* Ingredients — second line so it doesn't crowd the chip strip. */}
      {ingredientList.length > 0 ? (
        <p className="mt-0.5 text-[11px] leading-snug text-slate-700">
          <span className="font-semibold">İçindekiler:</span>{" "}
          {ingredientList.join(", ")}
        </p>
      ) : null}

      {/* Legal notes — boxed; tone follows the allergen / non-allergen
          text detection so the printed page mirrors the on-screen
          drawer convention. */}
      {hasLegalNotes ? (
        <p
          className={
            "mt-1 rounded border px-2 py-1 text-[11px] leading-snug " +
            (isAllergenNote(item.legal_notes!)
              ? "border-rose-300 bg-rose-50 text-rose-900"
              : "border-amber-300 bg-amber-50 text-amber-900")
          }
        >
          <span className="font-semibold">Yasal not:</span> {item.legal_notes}
        </p>
      ) : null}
    </article>
  );
}

/** Mirror of the same helper in ItemDetailDrawer — keeps the colour
 *  rule for legal_notes consistent across drawer + print. */
function isAllergenNote(text: string): boolean {
  const lower = text.toLocaleLowerCase("tr-TR");
  return lower.includes("alerjen") || lower.includes("alerji");
}