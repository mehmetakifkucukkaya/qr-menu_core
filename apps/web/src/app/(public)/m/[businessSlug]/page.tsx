import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cookies } from "next/headers";

import { BusinessHero } from "@/components/public/BusinessHero";
import { LocaleSelector } from "@/components/public/LocaleSelector";
import { FloatingCtas } from "@/components/public/FloatingCtas";
import { EmptyState } from "@/components/public/EmptyState";
import { MenuViewClient } from "@/components/public/MenuViewClient";
import { HeaderCartIcon } from "@/components/public/HeaderCartIcon";
import { AccountHeaderChip } from "@/components/public/AccountHeaderChip";
import { fetchPublicMenu, PublicMenuError } from "@/lib/api";
import {
  fetchCustomerLoyalty,
  fetchCustomerProfileOrNull,
  fetchPublicLoyaltySettings,
} from "@/lib/api-account";
import { humanizeSlug } from "@/lib/format";
import {
  buildAlternates,
  buildJsonLdRestaurant,
  buildOgMetadata,
} from "@/lib/seo";
import type { LocaleCode } from "@/types/menu";

interface PageProps {
  params: { businessSlug: string };
  searchParams: { locale?: string; branch?: string };
}

const DEFAULT_LOCALE: LocaleCode =
  (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as LocaleCode) || "tr";

function resolveLocale(raw?: string): LocaleCode {
  return raw === "en" || raw === "tr" ? raw : DEFAULT_LOCALE;
}

/** Absolute origin used to build canonical / hreflang URLs.
 *  Matches the root layout's metadataBase so URL resolution is consistent. */
function resolveOrigin(): string {
  return process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
}

/**
 * Public menu page (server component).
 *
 * Runs on the server, fetches the menu payload from the backend over the
 * Docker internal network (`internal: true`), and streams the rendered
 * HTML. The browser never talks to the backend directly in V1.
 *
 * Composition (Sprint 3B-2 + Sprint 8B + Sprint 9C SEO):
 *   - `<head>` metadata: title, description, canonical, hreflang alternates
 *     (every supported locale + x-default), OG locale + alternateLocale,
 *     twitter card
 *   - JSON-LD `<script type="application/ld+json">` with the Schema.org
 *     graph (Restaurant + Menu + MenuSection + MenuItem) — see
 *     `lib/seo.buildJsonLdRestaurant`
 *   - sticky header (logo + business name + LocaleSelector + HeaderCartIcon + CTAs)
 *   - BusinessHero (cover + logo + name + theme override)
 *   - MenuViewClient (CategoryNav + CategorySection + ItemDetailDrawer + CartFab + CartDrawer)
 *   - FloatingCtas (mobile only bottom bar)
 *   - footer
 *
 * Note on `<html lang>`: Next 14 App Router locks the `<html>` element to
 * the root layout — per-route language switching requires either a
 * i18n library (next-intl etc., not in V1) or a custom root layout per
 * locale. hreflang tags are the primary SEO signal for language
 * targeting, so this is acceptable for V1; tracked as a limitation in
 * Sprint 9C report.
 */
export default async function PublicMenuPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale(searchParams.locale);
  const branch = searchParams.branch;

  try {
    const payload = await fetchPublicMenu(params.businessSlug, {
      locale,
      branch,
      internal: true,
    });

    // Sprint 10B — fetch customer profile + loyalty server-side so the
    // header chip + checkout can adapt to the cookie state without an
    // extra round-trip. All failures here are swallowed — the public
    // menu page never breaks on a missing cookie / unconfigured
    // loyalty.
    const cookieHeader = cookies()
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const [customerProfile, publicLoyaltySettings] = await Promise.all([
      fetchCustomerProfileOrNull({ internal: true, cookieHeader }).catch(
        () => null,
      ),
      fetchPublicLoyaltySettings(params.businessSlug, { internal: true }).catch(
        () => null,
      ),
    ]);
    const customerLoyalty = customerProfile
      ? await fetchCustomerLoyalty(params.businessSlug, {
          internal: true,
          cookieHeader,
        }).catch(() => null)
      : null;
    const headerInitial = customerProfile
      ? {
          id: customerProfile.id,
          email: customerProfile.email,
          full_name: customerProfile.full_name,
        }
      : null;
    const headerLoyaltyBalance =
      customerLoyalty?.balance && customerLoyalty.organization
        ? customerLoyalty.balance
        : 0;

    // JSON-LD Schema.org graph — Sprint 9C. Server-rendered inside the
    // <body> (Next 14 App Router renders inline <script> tags in the
    // body; crawlers accept either location).
    const jsonLd = buildJsonLdRestaurant({
      host: resolveOrigin(),
      basePath: `/m/${params.businessSlug}`,
      payload,
      locale,
    });
    return (
      <>
        <script
          type="application/ld+json"
          // The payload is JSON.stringify'd from a hand-built object —
          // no user input flows into the script body. dangerouslySetInnerHTML
          // is required because React escapes `<` / `>` in <script> children.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <MenuView
          payload={payload}
          locale={locale}
          businessSlug={params.businessSlug}
          customerProfile={customerProfile}
          customerLoyalty={
            customerLoyalty
              ? {
                  balance: customerLoyalty.balance,
                  settings: publicLoyaltySettings,
                }
              : null
          }
          headerInitial={headerInitial}
          headerLoyaltyBalance={headerLoyaltyBalance}
        />
      </>
    );
  } catch (err) {
    if (err instanceof PublicMenuError) {
      // 404 → bubble up to the not-found.tsx in this segment.
      if (err.status === 404) notFound();
      // Any other status → the segment's error.tsx boundary.
      throw err;
    }
    throw err;
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  try {
    const payload = await fetchPublicMenu(params.businessSlug, {
      locale: DEFAULT_LOCALE,
      internal: true,
    });
    const { business, menu } = payload;
    const ogImage = business.cover_image || "/demo-assets/og-image.jpg";
    const description = `${business.name} — dijital menü${
      menu?.description ? `: ${menu.description}` : ""
    }`.slice(0, 200);

    // Resolve the locales this page advertises. Prefer the menu's
    // declared `supported_locales` (Sprint 4B schema) and fall back to
    // the business default when the menu is null.
    const supported = (
      menu?.supported_locales && menu.supported_locales.length > 0
        ? menu.supported_locales
        : [business.default_locale]
    ) as string[];
    const currentLocale = resolveLocale(searchParams.locale);
    const { canonical, languages } = buildAlternates({
      host: resolveOrigin(),
      basePath: `/m/${params.businessSlug}`,
      locales: supported,
      currentLocale,
    });
    const og = buildOgMetadata({
      business,
      menu,
      ogImage,
      locales: supported,
      currentLocale,
    });

    return {
      title: business.name,
      description,
      alternates: {
        canonical,
        languages,
      },
      openGraph: {
        ...og,
        // Reuse the languages map so Next.js renders
        // `<link rel="alternate" hreflang="…" href="…" />` × N from
        // metadata.alternates.languages (above) AND surface the OG
        // variants via openGraph.alternateLocale (helper output).
      },
      twitter: {
        card: "summary_large_image",
        title: `${business.name} — Dijital Menü`,
        description,
        images: [ogImage],
      },
      robots: { index: true, follow: true },
    };
  } catch {
    return {
      title: humanizeSlug(params.businessSlug),
    };
  }
}

function MenuView({
  payload,
  locale,
  businessSlug,
  customerProfile,
  customerLoyalty,
  headerInitial,
  headerLoyaltyBalance,
}: {
  payload: Awaited<ReturnType<typeof fetchPublicMenu>>;
  locale: LocaleCode;
  businessSlug: string;
  customerProfile: {
    id: number;
    email: string;
    full_name: string;
    phone: string;
  } | null;
  customerLoyalty: {
    balance: number;
    settings: import("@/types/account").PublicLoyaltySettings | null;
  } | null;
  headerInitial: {
    id: number;
    email: string;
    full_name: string;
  } | null;
  headerLoyaltyBalance: number;
}) {
  const { business, menu, theme, categories, cta, allergens, dietary_tags } =
    payload;
  const isEmpty =
    categories.length === 0 ||
    categories.every((c) => c.items.length === 0);

  return (
    <main className="min-h-screen bg-background">
      {/* Sticky top bar: logo + name + locale selector + account chip
          + cart icon + inline CTAs (sm+). */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {business.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={business.logo}
                alt=""
                aria-hidden="true"
                className="h-7 w-7 shrink-0 rounded-full bg-surface object-cover ring-1 ring-border"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
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
          <div className="flex shrink-0 items-center gap-2">
            <LocaleSelector current={locale} />
            <AccountHeaderChip
              initialProfile={headerInitial}
              initialLoyaltyBalance={headerLoyaltyBalance}
            />
            <HeaderCartIcon />
          </div>
        </div>
      </header>

      <BusinessHero business={business} theme={theme} />

      {menu ? (
        <p className="px-4 pt-3 text-center text-xs text-muted sm:text-sm">
          {menu.name}
        </p>
      ) : null}

      {isEmpty ? (
        <div className="mx-auto mt-6 max-w-2xl px-4">
          <EmptyState />
        </div>
      ) : (
        <MenuViewClient
          businessSlug={businessSlug}
          business={business}
          menu={menu}
          categories={categories}
          allergens={allergens}
          dietaryTags={dietary_tags}
          locale={locale}
          customerProfile={customerProfile}
          customerLoyalty={customerLoyalty}
        />
      )}

      {/* Mobile-only floating CTAs (tel + WhatsApp). */}
      <FloatingCtas cta={cta} />

      <footer className="mx-auto mt-10 max-w-2xl border-t border-border px-4 py-6 text-center text-xs text-muted">
        <p>
          © {new Date().getFullYear()} {business.name} ·{" "}
          <span className="uppercase tracking-wider">QR Menü</span>
        </p>
      </footer>
    </main>
  );
}