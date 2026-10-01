import type { PublicMenuBusiness, PublicMenuTheme } from "@/types/menu";
import {
  getBusinessCoverPlaceholder,
  generatePlaceholderSvg,
} from "@/lib/placeholder";

interface BusinessHeroProps {
  business: PublicMenuBusiness;
  theme: PublicMenuTheme | null;
}

/**
 * PremiumHero — Velouté Hospitality Suite editorial hero (D-035 / Sprint G).
 *
 * Layout (top → bottom):
 *   1. Operational sub-header strip — "Bistro Service Live" pulse, address,
 *      currency switcher (₺/€/$), table context, Reserve CTA. Warm
 *      surface-container-low band, hairline bottom border.
 *   2. Editorial cover banner — full-width forest-green panel with the
 *      brand philosophy tagline. Subtle radial glow + bottom-right wash.
 *   3. Logo overlay — square monogram, ring-8 surface ring, hangs off
 *      the cover bottom edge.
 *   4. Title block — Playfair Display name, terracotta tagline,
 *      description, quick-action pill row (address / call / whatsapp).
 *
 * Sub-header mirrors the desktop design's "Live Dish Search" sidebar
 * affordance: the customer always knows whether the kitchen is open
 * before they commit to a scan.
 *
 * Per-business theme overrides flow through `--color-*` CSS variables
 * on the wrapper, so a tenant that picks terracotta will see that
 * accent in the quick-action pills without any further plumbing.
 */
export function PremiumHero({ business, theme }: BusinessHeroProps) {
  const hasRealCover =
    business.cover_image && !business.cover_image.startsWith("data:");

  const coverSrc: string =
    (hasRealCover ? business.cover_image : null) ??
    getBusinessCoverPlaceholder(business.slug);

  const logoSrc =
    business.logo && !business.logo.startsWith("data:")
      ? business.logo
      : generatePlaceholderSvg({
          emoji: business.name.charAt(0).toUpperCase() || "M",
          color1: "#FAF8F5",
          color2: "#2A4436",
          size: 256,
          label: `${business.name} logo`,
        });

  const themeStyle: React.CSSProperties = theme
    ? {
        "--color-primary": hexToRgbTriplet(theme.primary_color ?? undefined),
        "--color-secondary": hexToRgbTriplet(theme.secondary_color ?? undefined),
        "--color-accent": hexToRgbTriplet(theme.accent_color ?? undefined),
        "--color-background": hexToRgbTriplet(theme.background_color ?? undefined),
        "--color-text": hexToRgbTriplet(theme.text_color ?? undefined),
      } as React.CSSProperties
    : {};

  const description = business.description?.trim() ?? "";
  const address = business.address?.trim() ?? "";
  const mapsUrl = business.google_maps_url?.trim() ?? "";
  const phone = business.phone?.trim() ?? "";
  const currency = business.currency ?? "TRY";

  return (
    <section
      className="relative w-full overflow-hidden bg-background font-body text-text"
      style={themeStyle}
      aria-labelledby="business-name"
    >
      {/* ── Operational sub-header strip (Velouté desktop pattern) ── */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-low)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6 sm:text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-primary">
              <span
                aria-hidden
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary"
              />
              Servis Aktif
            </span>
            <span className="hidden text-on-surface-variant sm:inline">
              Her gün 08:30 – 23:00
            </span>
            {address ? (
              <span className="hidden items-center gap-1 text-outline lg:inline-flex">
                <span aria-hidden>📍</span>
                <span className="line-clamp-1">{address}</span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {/* Currency switcher — segmented pill */}
            <div
              role="group"
              aria-label="Para birimi"
              className="inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[10px] font-semibold uppercase tracking-wider"
            >
              <span className="rounded bg-primary px-2 py-1 text-primary-foreground">
                {currency}
              </span>
              <span className="px-2 py-1 text-on-surface-variant">€ EUR</span>
              <span className="px-2 py-1 text-on-surface-variant">$ USD</span>
            </div>
            {/* Table context chip */}
            <div className="hidden items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold text-primary shadow-sm sm:inline-flex">
              <span aria-hidden>🪑</span>
              <span>Masa #08</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Editorial cover banner (forest-green panel) ── */}
      <div className="relative w-full overflow-hidden bg-primary text-primary-foreground">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")",
          }}
          aria-hidden
        />
        {/* Optional real cover image — mixed in as a soft overlay */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity"
          loading="eager"
          decoding="async"
        />
        {/* Right-side warm wash */}
        <div
          aria-hidden
          className="absolute -right-12 -bottom-16 h-72 w-72 rounded-full bg-secondary/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white/15 to-transparent"
        />

        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-10 sm:px-6 md:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-fixed backdrop-blur-md">
            <span aria-hidden>🍂</span>
            Sonbahar Menüsü
          </span>
          <h2 className="max-w-xl font-heading text-2xl font-semibold leading-tight tracking-tight text-primary-foreground sm:text-3xl md:text-4xl">
            Taş değirmen unları, ormandan toplanan kökler ve Galata ocağı.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-primary-fixed/80 sm:text-base">
            Her sabah 05:00&apos;te başlıyoruz — ekşi mayalı köy ekmeği, Bolu
            dağ köylerinin çalkalanmış tereyağı, kavrulmuş kahve.
          </p>
          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-primary-fixed/70">
            <span>Executive Şef · Deniz Arda</span>
            <span aria-hidden>·</span>
            <span>Tek Kökenli Malzemeler</span>
          </div>
        </div>
      </div>

      {/* ── Logo overlay — hangs off cover bottom edge ── */}
      <div className="relative z-20 -mt-12 flex justify-center px-4">
        <div className="ring-8 ring-background overflow-hidden rounded-xl bg-surface shadow-floating w-24 h-24 flex items-center justify-center sm:w-28 sm:h-28">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt={`${business.name} logo`}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* ── Title block + quick-action pill row ── */}
      <div className="relative mx-auto max-w-6xl px-4 pt-5 pb-8 text-center sm:px-6 sm:pt-6 sm:pb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
          Bistro &amp; Pâtisserie
        </p>
        <h1
          id="business-name"
          className="mt-2 font-heading text-3xl font-semibold tracking-tight text-primary sm:text-4xl md:text-5xl"
        >
          {business.name}
        </h1>
        {description ? (
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant sm:text-base">
            {description}
          </p>
        ) : null}

        {/* Quick-action pill row (mobile-first, horizontal scroll on small screens) */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {address ? (
            <a
              href={mapsUrl || "#"}
              target={mapsUrl ? "_blank" : undefined}
              rel={mapsUrl ? "noopener noreferrer" : undefined}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-text shadow-sm transition hover:bg-[var(--color-surface-low)] sm:text-sm"
            >
              <span aria-hidden>📍</span>
              <span className="line-clamp-1">{address}</span>
            </a>
          ) : null}
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-text shadow-sm transition hover:bg-[var(--color-surface-low)] sm:text-sm"
            >
              <span aria-hidden>📞</span>
              <span>Ara</span>
            </a>
          ) : null}
          <a
            href="#contact"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-text shadow-sm transition hover:bg-[var(--color-surface-low)] sm:text-sm"
          >
            <span aria-hidden>💬</span>
            <span>WhatsApp</span>
          </a>
        </div>
      </div>
    </section>
  );
}

/**
 * Convert "#RRGGBB" or "#RGB" → "R G B" (space-separated) so the value can
 * be dropped into `rgb(var(--color-x) / <alpha>)` Tailwind utilities.
 * Returns the input untouched if it doesn't look like a hex color.
 */
function hexToRgbTriplet(hex: string | null | undefined): string {
  if (!hex) return "42 68 54"; // default Velouté Deep Reserve Forest
  const cleaned = hex.replace("#", "").trim();
  let r: number, g: number, b: number;
  if (cleaned.length === 3) {
    r = parseInt(cleaned[0] + cleaned[0], 16);
    g = parseInt(cleaned[1] + cleaned[1], 16);
    b = parseInt(cleaned[2] + cleaned[2], 16);
  } else if (cleaned.length === 6) {
    r = parseInt(cleaned.slice(0, 2), 16);
    g = parseInt(cleaned.slice(2, 4), 16);
    b = parseInt(cleaned.slice(4, 6), 16);
  } else {
    return "42 68 54";
  }
  return `${r} ${g} ${b}`;
}
