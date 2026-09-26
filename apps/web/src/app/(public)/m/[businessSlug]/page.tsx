import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BusinessHero } from "@/components/public/BusinessHero";
import { ItemCard } from "@/components/public/ItemCard";
import { fetchPublicMenu, PublicMenuError } from "@/lib/api";
import { humanizeSlug } from "@/lib/format";
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

/**
 * Public menu page (server component).
 *
 * Runs on the server, fetches the menu payload from the backend over the
 * Docker internal network (`internal: true`), and streams the rendered
 * HTML. The browser never talks to the backend directly in V1.
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
    return <MenuView payload={payload} locale={locale} />;
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const payload = await fetchPublicMenu(params.businessSlug, {
      locale: DEFAULT_LOCALE,
      internal: true,
    });
    return {
      title: payload.business.name,
      description: `${payload.business.name} — dijital menü`,
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
}: {
  payload: Awaited<ReturnType<typeof fetchPublicMenu>>;
  locale: LocaleCode;
}) {
  const { business, menu, theme, categories, cta } = payload;
  const isEmpty = categories.length === 0 || categories.every((c) => c.items.length === 0);

  return (
    <main className="min-h-screen bg-background pb-24">
      <BusinessHero business={business} theme={theme} />

      {menu ? (
        <p className="px-4 pt-4 text-center text-xs text-muted sm:text-sm">
          {menu.name}
        </p>
      ) : null}

      <div className="mx-auto mt-6 max-w-2xl space-y-8 px-4">
        {isEmpty ? (
          <EmptyState />
        ) : (
          categories.map((category) => (
            <section
              key={category.id}
              id={`category-${category.slug}`}
              aria-labelledby={`category-${category.slug}-title`}
              className="scroll-mt-4"
            >
              <header className="mb-3 flex items-baseline justify-between">
                <h2
                  id={`category-${category.slug}-title`}
                  className="font-heading text-xl font-semibold text-text sm:text-2xl"
                >
                  {category.name}
                </h2>
                <span className="text-xs text-muted">
                  {category.items.length} ürün
                </span>
              </header>
              {category.description ? (
                <p className="mb-3 text-sm text-muted">{category.description}</p>
              ) : null}
              <ul className="space-y-3">
                {category.items.map((item) => (
                  <li key={item.id}>
                    <ItemCard item={item} category={category} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {cta?.call_phone || cta?.whatsapp ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4 sm:hidden">
          <div className="pointer-events-auto flex gap-2 rounded-full bg-surface/95 px-3 py-2 shadow-floating ring-1 ring-border backdrop-blur">
            {cta.call_phone ? (
              <a
                href={`tel:${cta.call_phone.replace(/\s+/g, "")}`}
                className="touch-target inline-flex items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                <span aria-hidden>📞</span>
                <span>Ara</span>
              </a>
            ) : null}
            {cta.whatsapp ? (
              <a
                href={`https://wa.me/${cta.whatsapp.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="touch-target inline-flex items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white"
              >
                <span aria-hidden>💬</span>
                <span>WhatsApp</span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
      <p className="font-heading text-lg text-text">Henüz yayınlanmış ürün yok.</p>
      <p className="mt-2 text-sm text-muted">
        İşletme sahibi menüyü yayınladığında burada görünecek.
      </p>
    </div>
  );
}
