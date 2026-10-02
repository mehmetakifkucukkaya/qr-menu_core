"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  LocaleCode,
  PublicMenuAllergen,
  PublicMenuBusiness,
  PublicMenuCategory,
  PublicMenuDietaryTag,
  PublicMenuItem,
  PublicMenuMenu,
} from "@/types/menu";
import type { PublicSettings } from "@/types/public";
import { trackEvent } from "@/lib/events";
import { resolveCurrency } from "@/lib/currency";
import {
  FeatureFlagProvider,
  useFeatureFlag,
} from "@/lib/feature-flags";
import { CategoryNav } from "./CategoryNav";
import { CategorySection } from "./CategorySection";
import { ItemDetailDrawer } from "./ItemDetailDrawer";
import { CartDrawer } from "./CartDrawer";
import { LocaleSelector } from "./LocaleSelector";
import { HeaderCartIcon } from "./HeaderCartIcon";
import { AccountHeaderChip } from "./AccountHeaderChip";
import { useCartStore } from "@/lib/cart-store";

interface MenuViewClientProps {
  publicSettings: PublicSettings | null;
  businessSlug: string;
  business: PublicMenuBusiness;
  menu: PublicMenuMenu | null;
  categories: PublicMenuCategory[];
  allergens: PublicMenuAllergen[];
  dietaryTags: PublicMenuDietaryTag[];
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
   *  the FeatureFlagProvider subtree (e.g. BusinessHero, menu name
   *  caption, EmptyState when the catalog is empty). */
  children?: React.ReactNode;
}

/**
 * MenuViewClient — owns the drawer state + sticky header for the
 * public menu page.
 *
 * Sprint B3b refactor: wraps the entire render output in
 * `<FeatureFlagProvider settings={publicSettings}>` so every descendant
 * (AccountHeaderChip, HeaderCartIcon, CartFab, the "Sipariş Ver" button
 * inside CartDrawer / CheckoutForm, ItemCard's "Sepete ekle" button) can
 * call `useFeatureFlag(...)` directly.
 *
 * Sprint G (D-035) — Velouté 3-column desktop layout:
 *   • Left rail  (col-span-3, sticky) — category navigation. Hides below `lg`.
 *   • Main feed  (col-span-6)         — editorial menu catalog with the
 *     sticky segmented category nav above (col-span-9 when there is no
 *     right rail).
 *   • Right rail (col-span-3, sticky) — cart summary. Hidden when the cart
 *     feature is off.
 *   • Mobile (< lg) — single column with the sticky CategoryNav and
 *     floating CartFab from earlier sprints.
 *
 * Only tenant data is rendered here. The earlier mock panels (dietary
 * filter with invented counts, a shared Wi-Fi password, fixed service
 * hours / "open now") were removed: they showed the same made-up values
 * on every tenant's public page (ANALYSIS_1 F-13).
 */
export function MenuViewClient({
  publicSettings,
  businessSlug,
  business,
  menu,
  categories,
  allergens,
  dietaryTags,
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
      {/* Sticky top bar — mobile-first: 48px chrome, account chip hidden
       *  on phones (moved to AccountHeaderChip's mobile sheet) */}
      <header className="sticky safe-top top-0 z-30 border-b border-[var(--color-border)] bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-2 px-3 sm:h-14 sm:gap-3 sm:px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {business.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={business.logo}
                alt=""
                aria-hidden="true"
                className="h-7 w-7 shrink-0 rounded-md bg-surface object-cover ring-1 ring-[var(--color-border)] sm:h-8 sm:w-8"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground sm:h-8 sm:w-8"
              >
                {business.name.charAt(0).toUpperCase()}
              </span>
            )}
            <span
              className="truncate font-heading text-sm font-semibold text-text sm:text-base"
              title={business.name}
            >
              {business.name}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <LocaleSelector current={locale} />
            <div className="hidden sm:block">
              <AccountHeaderChip
                initialProfile={headerInitial}
                initialLoyaltyBalance={headerLoyaltyBalance}
              />
            </div>
            <HeaderCartIcon />
          </div>
        </div>
      </header>

      {children}

      {!isEmpty ? (
        <MenuContent
          businessSlug={businessSlug}
          currency={currency}
          catalogLookup={catalogLookup}
          customerProfile={customerProfile}
          customerLoyalty={customerLoyalty}
          categories={categories}
          allergens={allergens}
          dietaryTags={dietaryTags}
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
  locale: LocaleCode;
  activeItem: PublicMenuItem | null;
  onItemSelect: (item: PublicMenuItem) => void;
  onItemClose: () => void;
}

/**
 * MenuContent — Velouté 3-column desktop layout + mobile single-column.
 *
 * Desktop (`lg:`): 12-col grid → left rail (col-3) + main feed (col-6) +
 * right cart rail (col-3). Left + right rails are `sticky top-28` so they
 * follow the user as the catalog scrolls.
 *
 * Mobile: single column. The sticky CategoryNav (full-width) sits above
 * the catalog; the floating CartFab rides in the bottom-right corner.
 */
function MenuContent({
  businessSlug,
  currency,
  catalogLookup,
  customerProfile,
  customerLoyalty,
  categories,
  allergens,
  dietaryTags,
  locale,
  activeItem,
  onItemSelect,
  onItemClose,
}: MenuContentProps) {
  const cartEnabled = useFeatureFlag("cart_enabled");
  const ordersEnabled = useFeatureFlag("orders_enabled");

  const totalItems = useCartStore((s) => s.totalItems());
  const openDrawer = useCartStore((s) => s.openDrawer);

  return (
    <>
      <CategoryNav categories={categories} />

      <div className="mx-auto mt-6 max-w-6xl px-4 pb-32 sm:px-6 sm:pb-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
          {/* ── LEFT RAIL: desktop-only sidebar (category list) ── */}
          <aside className="hidden lg:sticky lg:top-28 lg:col-span-3 lg:flex lg:flex-col lg:gap-4 lg:self-start">
            <CategoryRail categories={categories} />
          </aside>

          {/* ── MAIN FEED: editorial catalog ── */}
          <section
            className={
              "flex flex-col gap-8 " +
              (cartEnabled ? "lg:col-span-6" : "lg:col-span-9")
            }
          >
            {categories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                onItemSelect={onItemSelect}
              />
            ))}
          </section>

          {/* ── RIGHT RAIL: desktop-only cart summary (when ordering is on) ── */}
          {cartEnabled ? (
            <aside className="hidden lg:sticky lg:top-28 lg:col-span-3 lg:flex lg:flex-col lg:gap-4 lg:self-start">
              <CartRail
                businessSlug={businessSlug}
                currency={currency}
                catalogLookup={catalogLookup}
                ordersEnabled={ordersEnabled}
                onOpenDrawer={openDrawer}
              />
            </aside>
          ) : null}
        </div>
      </div>

      {cartEnabled ? (
        <CartFab count={totalItems} onClick={openDrawer} />
      ) : null}

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

/* ── Desktop left-rail helpers (Velouté 3-col layout) ─────────────────── */

function CategoryRail({ categories }: { categories: PublicMenuCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <nav
      aria-label="Menü bölümleri"
      className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] bg-surface p-3 shadow-sm"
    >
      <span className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-outline">
        Menü Bölümleri
      </span>
      {categories.map((cat, idx) => (
        <a
          key={cat.id}
          href={`#category-${cat.slug}`}
          className={
            "flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm font-medium transition " +
            (idx === 0
              ? "bg-[var(--color-surface-low)] font-bold text-primary"
              : "text-on-surface-variant hover:bg-[var(--color-surface-low)] hover:text-text")
          }
        >
          <span className="line-clamp-1">{cat.name}</span>
          <span
            className={
              "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-pill px-1.5 text-[10px] font-semibold " +
              (idx === 0
                ? "bg-primary text-primary-foreground"
                : "text-outline")
            }
          >
            {cat.items.length}
          </span>
        </a>
      ))}
    </nav>
  );
}

/* ── Desktop right-rail helpers ────────────────────────────────────────── */

function CartRail({
  businessSlug,
  currency,
  catalogLookup,
  ordersEnabled,
  onOpenDrawer,
}: {
  businessSlug: string;
  currency: string;
  catalogLookup: Record<number, PublicMenuItem>;
  ordersEnabled: boolean;
  onOpenDrawer: () => void;
}) {
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.totalAmount());
  const count = useCartStore((s) => s.totalItems());

  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-base font-semibold text-primary">
          Adisyon Özeti
        </h3>
        <span className="rounded-pill bg-[var(--color-surface-low)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          {count} ürün
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-low)] p-3 text-center text-xs text-on-surface-variant">
          Henüz sepete ürün eklemediniz.
        </p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {items.map((it) => {
            const catalog = catalogLookup[it.menuItemId];
            return (
              <li
                key={it.menuItemId}
                className="flex items-center justify-between gap-2 rounded-md bg-[var(--color-surface-low)] px-2 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-primary text-[10px] font-bold text-primary-foreground">
                    {it.quantity}
                  </span>
                  <span className="line-clamp-1 font-medium text-text">
                    {catalog?.name ?? it.name}
                  </span>
                </div>
                <span className="shrink-0 font-heading text-xs font-semibold tabular-nums text-primary">
                  {fmt(Number(it.price) * it.quantity)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          Toplam
        </span>
        <span className="font-heading text-lg font-bold tabular-nums text-primary">
          {fmt(total)}
        </span>
      </div>

      {ordersEnabled ? (
        <button
          type="button"
          onClick={onOpenDrawer}
          disabled={count === 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-secondary px-4 py-2 text-sm font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-secondary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sepete Git · {fmt(total)}
        </button>
      ) : null}
    </div>
  );
}

function CartFab({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sepetim — ${count} ürün`}
      className="safe-bottom-fixed fixed right-3 z-30 inline-flex h-12 items-center gap-2 rounded-pill bg-primary px-4 text-sm font-bold uppercase tracking-wider text-primary-foreground shadow-floating transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 active:scale-[0.98] sm:hidden"
    >
      <span aria-hidden>🛒</span>
      Sepetim · {count}
    </button>
  );
}
