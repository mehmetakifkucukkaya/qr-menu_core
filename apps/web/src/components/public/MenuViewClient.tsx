"use client";

import clsx from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { SmartImage } from "@/components/ui/SmartImage";
import { useCartStore } from "@/lib/cart-store";
import { resolveCurrency } from "@/lib/currency";
import { trackEvent } from "@/lib/events";
import { FeatureFlagProvider, useFeatureFlag } from "@/lib/feature-flags";
import { formatPrice } from "@/lib/format";
import type {
  LocaleCode,
  PublicMenuAllergen,
  PublicMenuBusiness,
  PublicMenuCategory,
  PublicMenuCta,
  PublicMenuDietaryTag,
  PublicMenuItem,
  PublicMenuMenu,
  Translation,
} from "@/types/menu";
import { pickTranslation } from "@/types/menu";
import type { PublicSettings } from "@/types/public";
import { BottomDock } from "./BottomDock";
import { CartDrawer } from "./CartDrawer";
import { CartHydrator } from "./CartHydrator";
import { CategoryNav } from "./CategoryNav";
import { CategorySection } from "./CategorySection";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { MenuHeader } from "./MenuHeader";
import { useCategorySpy } from "./useCategorySpy";

interface MenuViewClientProps {
  publicSettings: PublicSettings | null;
  businessSlug: string;
  business: PublicMenuBusiness;
  menu: PublicMenuMenu | null;
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  cta: PublicMenuCta;
  locale: LocaleCode;
  customerProfile?: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
  } | null;
  customerLoyalty?: {
    balance: number;
    settings: import("@/types/account").PublicLoyaltySettings | null;
  } | null;
  headerInitial?: {
    id: number;
    email: string;
    full_name: string;
  } | null;
  headerLoyaltyBalance?: number;
  /** Sprint B3b — server-rendered content that needs to live *inside*
   *  the FeatureFlagProvider subtree (e.g. the hero, the EmptyState when
   *  the catalog is empty). */
  children?: React.ReactNode;
}

/**
 * MenuViewClient — owns the drawer state, the sticky header and the layout of
 * the public menu page.
 *
 * Wraps everything in `<FeatureFlagProvider settings={publicSettings}>` so
 * every descendant (account chip, cart icon, dock, "Sepete ekle" controls,
 * the "Sipariş Ver" button in the cart) can call `useFeatureFlag(...)`.
 *
 * Layout
 *   • phones / tablets — one column: floating header, hero, sticky category
 *     chips, the dishes, and a bottom dock (contact + cart).
 *   • desktop (`lg`) — three columns: category rail (left, sticky), the
 *     catalogue (centre), cart summary (right, sticky, only when ordering is
 *     enabled). The chip row and the dock are hidden there.
 *
 * Only tenant data is rendered. The earlier mock panels (dietary filter with
 * invented counts, a shared Wi-Fi password, fixed service hours) were removed
 * in Faz 0 because they showed the same made-up values on every tenant's page
 * (ANALYSIS_1 F-13).
 */
export function MenuViewClient({
  publicSettings,
  businessSlug,
  business,
  menu,
  categories,
  allergens,
  dietaryTags,
  cta,
  locale,
  customerProfile,
  customerLoyalty,
  headerInitial,
  headerLoyaltyBalance,
  children,
}: MenuViewClientProps) {
  const [activeItem, setActiveItem] = useState<PublicMenuItem | null>(null);

  const handleSelect = useCallback((item: PublicMenuItem) => {
    setActiveItem(item);
  }, []);

  const handleClose = useCallback(() => {
    setActiveItem(null);
  }, []);

  // Analytics: menu_view (once per mount) + qr_open (once if URL has ?qr=).
  const menuViewFired = useRef(false);
  const qrOpenFired = useRef(false);
  useEffect(() => {
    if (!menuViewFired.current) {
      menuViewFired.current = true;
      trackEvent("menu_view", { locale });
    }
    if (!qrOpenFired.current) {
      const params = new URLSearchParams(window.location.search);
      const qrParam = params.get("qr");
      if (qrParam) {
        const qrId = Number.parseInt(qrParam, 10);
        if (Number.isFinite(qrId)) {
          qrOpenFired.current = true;
          trackEvent("qr_open", { qr_id: qrId, locale });
        }
      }
    }
  }, [locale]);

  // Catalog lookup for cart thumbnails.
  const catalogLookup: Record<number, PublicMenuItem> = {};
  const allItems: PublicMenuItem[] = [];
  for (const cat of categories) {
    for (const it of cat.items) {
      catalogLookup[it.id] = it;
      allItems.push(it);
    }
  }

  // Currency resolution chain.
  const currency = resolveCurrency(menu, business, allItems);

  const isEmpty =
    categories.length === 0 ||
    categories.every((c) => c.items.length === 0);

  return (
    <FeatureFlagProvider settings={publicSettings}>
      {/* First on purpose: restores the saved cart before any sibling effect
       *  can write to the (persisted) store. See CartHydrator. */}
      <CartHydrator />

      <MenuHeader
        business={business}
        locale={locale}
        headerInitial={headerInitial}
        headerLoyaltyBalance={headerLoyaltyBalance}
      />

      {children}

      {!isEmpty ? (
        <MenuContent
          businessSlug={businessSlug}
          business={business}
          currency={currency}
          catalogLookup={catalogLookup}
          customerProfile={customerProfile}
          customerLoyalty={customerLoyalty}
          categories={categories}
          allergens={allergens}
          dietaryTags={dietaryTags}
          cta={cta}
          locale={locale}
          activeItem={activeItem}
          onItemSelect={handleSelect}
          onItemClose={handleClose}
        />
      ) : null}
    </FeatureFlagProvider>
  );
}

interface MenuContentProps {
  businessSlug: string;
  business: PublicMenuBusiness;
  currency: string;
  catalogLookup: Record<number, PublicMenuItem>;
  customerProfile?: {
    id: number;
    full_name: string;
    phone: string;
    email: string;
  } | null;
  customerLoyalty?: {
    balance: number;
    settings: import("@/types/account").PublicLoyaltySettings | null;
  } | null;
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
  cta: PublicMenuCta;
  locale: LocaleCode;
  activeItem: PublicMenuItem | null;
  onItemSelect: (item: PublicMenuItem) => void;
  onItemClose: () => void;
}

function MenuContent({
  businessSlug,
  business,
  currency,
  catalogLookup,
  customerProfile,
  customerLoyalty,
  categories,
  allergens,
  dietaryTags,
  cta,
  locale,
  activeItem,
  onItemSelect,
  onItemClose,
}: MenuContentProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");
  const ordersEnabled = useFeatureFlag("orders_enabled");
  const openDrawer = useCartStore((s) => s.openDrawer);

  const slugs = useMemo(() => categories.map((c) => c.slug), [categories]);
  const activeSlug = useCategorySpy(slugs);

  // Allergen codes arrive as English identifiers ("dairy"); the payload carries
  // their localised names, which the dish cards show instead of the raw code.
  const allergenNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of allergens) {
      map[a.code] = pickTranslation(a.name as Translation, locale) || a.code;
    }
    return map;
  }, [allergens, locale]);

  return (
    <>
      <CategoryNav categories={categories} activeSlug={activeSlug} />

      <div className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 lg:pb-16 lg:pt-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          {/* ── LEFT RAIL: desktop-only category list ── */}
          <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.25rem)] lg:col-span-3 lg:block">
            <CategoryRail categories={categories} activeSlug={activeSlug} />
          </aside>

          {/* ── MAIN FEED ── */}
          <div
            className={clsx(
              "flex flex-col gap-10",
              cartEnabled ? "lg:col-span-6" : "lg:col-span-9",
            )}
          >
            {categories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                onItemSelect={onItemSelect}
                allergenNames={allergenNames}
              />
            ))}
          </div>

          {/* ── RIGHT RAIL: desktop-only cart summary (when ordering is on) ── */}
          {cartEnabled ? (
            <aside className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.25rem)] lg:col-span-3 lg:block">
              <CartRail
                currency={currency}
                catalogLookup={catalogLookup}
                ordersEnabled={ordersEnabled}
                onOpenDrawer={openDrawer}
              />
            </aside>
          ) : null}
        </div>
      </div>

      <BottomDock business={business} cta={cta} currency={currency} />

      <ItemDetailDrawer
        item={activeItem}
        allergens={allergens}
        dietaryTags={dietaryTags}
        locale={locale}
        onClose={onItemClose}
      />

      {cartEnabled ? (
        <CartDrawer
          businessSlug={businessSlug}
          currency={currency}
          catalogLookup={catalogLookup}
          customerProfile={customerProfile}
          customerLoyalty={customerLoyalty}
          ordersEnabled={ordersEnabled}
        />
      ) : null}
    </>
  );
}

/* ── Desktop left rail ─────────────────────────────────────────────────── */

function CategoryRail({
  categories,
  activeSlug,
}: {
  categories: PublicMenuCategory[];
  activeSlug: string | null;
}) {
  if (categories.length === 0) return null;
  return (
    <nav
      aria-label="Menü bölümleri"
      className="rounded-2xl bg-surface p-2.5 shadow-card ring-1 ring-border/60"
    >
      <p className="px-3 pb-2 pt-1.5 text-xs font-semibold tracking-wide text-outline">
        Menü bölümleri
      </p>
      <ul className="flex flex-col gap-0.5">
        {categories.map((cat) => {
          const isActive = cat.slug === activeSlug;
          return (
            <li key={cat.id}>
              <a
                href={`#category-${cat.slug}`}
                aria-current={isActive ? "true" : undefined}
                className={clsx(
                  "flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200",
                  isActive
                    ? "bg-primary-soft font-semibold text-primary"
                    : "font-medium text-muted hover:bg-surface-low hover:text-text",
                )}
              >
                <span className="line-clamp-1">{cat.name}</span>
                <span
                  className={clsx(
                    "text-xs tabular-nums",
                    isActive ? "text-primary" : "text-outline",
                  )}
                >
                  {cat.items.length}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── Desktop right rail ────────────────────────────────────────────────── */

function CartRail({
  currency,
  catalogLookup,
  ordersEnabled,
  onOpenDrawer,
}: {
  currency: string;
  catalogLookup: Record<number, PublicMenuItem>;
  ordersEnabled: boolean;
  onOpenDrawer: () => void;
}) {
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.totalAmount());
  const count = useCartStore((s) => s.totalItems());

  const cur = items[0]?.currency ?? currency;
  const fmt = (n: number) => formatPrice(n.toFixed(2), cur);

  return (
    <section
      aria-labelledby="cart-rail-title"
      className="flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-card ring-1 ring-border/60"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="cart-rail-title"
          className="font-heading text-lg font-semibold text-text"
        >
          Adisyon Özeti
        </h3>
        <span className="rounded-pill bg-surface-low px-2.5 py-1 text-xs font-semibold tabular-nums text-muted">
          {count} ürün
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-low px-4 py-6 text-center">
          <ShoppingBag className="h-6 w-6 text-outline" aria-hidden />
          <p className="text-sm text-muted">Henüz sepete ürün eklemediniz.</p>
        </div>
      ) : (
        <ul className="-mx-1 flex max-h-72 flex-col gap-1 overflow-y-auto px-1">
          {items.map((it) => {
            const catalog = catalogLookup[it.menuItemId];
            const thumb = it.image ?? catalog?.image ?? null;
            return (
              <li
                key={it.menuItemId}
                className="flex items-center gap-3 rounded-xl py-1.5"
              >
                {thumb ? (
                  <SmartImage
                    src={thumb}
                    alt=""
                    aria-hidden
                    thumbnail
                    wrapperClassName="h-10 w-10 shrink-0 rounded-lg"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm font-medium text-text">
                    {catalog?.name ?? it.name}
                  </p>
                  <p className="text-xs tabular-nums text-muted">
                    {it.quantity} × {formatPrice(it.price, it.currency)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                  {fmt(Number(it.price) * it.quantity)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-sm font-medium text-muted">Toplam</span>
        <span className="font-heading text-2xl font-semibold tabular-nums text-primary">
          {fmt(total)}
        </span>
      </div>

      {ordersEnabled ? (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onOpenDrawer}
          disabled={count === 0}
        >
          Sepete Git
        </Button>
      ) : null}
    </section>
  );
}
