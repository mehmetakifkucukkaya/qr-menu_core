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
 * PremiumHero — Sprint F redesigned hero (V1 Polish).
 *
 * Visual structure (top → bottom):
 *   1. Full-width gradient cover (h-72 md:h-96) with subtle noise overlay
 *   2. Logo monogram (128px, ring-8, positioned bottom-center of cover)
 *   3. Title block — name (Display 2xl Playfair SC) + tagline + currency badge
 *   4. Contact strip — address + phone + email + website (icons, dot-separated)
 *
 * Per-business theme overrides (theme.primary_color etc.) flow through
 * CSS variables on the wrapper so the rest of the page keeps Modern Cafe
 * defaults. The hero itself reuses primary as the gradient seed color
 * (gentle 12° rotation for warmth).
 *
 * Cover image: if a real image is set, it layers above the gradient.
 * Otherwise we render an SVG placeholder with the business initial.
 *
 * Sprint A (Faz 1.1): cover_image + logo + description strip kept.
 * Sprint F: layout hierarchy elevated — Display/H2/H4 scale, asymmetric
 * spacing, logo overlay, hero-as-backdrop pattern.
 */
export function PremiumHero({ business, theme }: BusinessHeroProps) {
  const hasRealCover =
    business.cover_image && !business.cover_image.startsWith("data:");

  const coverSrc = hasRealCover
    ? business.cover_image
    : getBusinessCoverPlaceholder(business.slug);

  const logoSrc =
    business.logo && !business.logo.startsWith("data:")
      ? business.logo
      : generatePlaceholderSvg({
          emoji: business.name.charAt(0).toUpperCase() || "M",
          color1: "#D4A574",
          color2: "#8B5A3C",
          size: 256,
          label: `${business.name} logo`,
        });

  const themeStyle: React.CSSProperties = theme
    ? {
        "--color-primary": hexToRgbTriplet(theme.primary_color),
        "--color-secondary": hexToRgbTriplet(theme.secondary_color),
        "--color-accent": hexToRgbTriplet(theme.accent_color),
        "--color-background": hexToRgbTriplet(theme.background_color),
        "--color-text": hexToRgbTriplet(theme.text_color),
      } as React.CSSProperties
    : {};

  const description = business.description?.trim() ?? "";
  const address = business.address?.trim() ?? "";
  const mapsUrl = business.google_maps_url?.trim() ?? "";
  const website = business.website?.trim() ?? "";
  const email = business.email?.trim() ?? "";
  const phone = business.phone?.trim() ?? "";

  return (
    <section
      className="relative w-full overflow-hidden bg-background"
      style={themeStyle}
      aria-labelledby="business-name"
    >
      {/* Cover backdrop — gradient + optional real image */}
      <div className="relative h-72 w-full overflow-hidden md:h-96">
        {/* Always-present warm gradient base */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-accent opacity-90"
        />
        {/* Optional real cover image layered above */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover mix-blend-overlay opacity-50"
          loading="eager"
          decoding="async"
        />
        {/* Subtle noise/grain for premium texture */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E\")",
          }}
        />
        {/* Bottom fade for logo legibility */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent"
        />
        {/* Currency badge — top right */}
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-pill border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white backdrop-blur-md">
          {business.currency} · QR Menü
        </span>
      </div>

      {/* Logo overlay — positioned at cover bottom */}
      <div className="relative -mt-16 flex justify-center md:-mt-20">
        <div className="ring-8 ring-background overflow-hidden rounded-full bg-surface shadow-floating w-32 h-32 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt={`${business.name} logo`}
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Title + tagline */}
      <div className="relative mt-6 flex flex-col items-center px-4 pb-2 text-center">
        <h1
          id="business-name"
          className="font-heading text-3xl font-bold tracking-tight text-text sm:text-4xl md:text-5xl"
        >
          {business.name}
        </h1>
        {description ? (
          <p className="mt-3 max-w-xl text-base text-muted sm:text-lg">
            {description}
          </p>
        ) : null}

        {/* Contact strip — only render when there's at least one item */}
        {(address || mapsUrl || website || email || phone) && (
          <ul className="mt-6 flex w-full max-w-2xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted">
            {address ? (
              <li>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-text transition-colors"
                  >
                    <span aria-hidden>📍</span>
                    <span className="line-clamp-1">{address}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden>📍</span>
                    <span className="line-clamp-1">{address}</span>
                  </span>
                )}
              </li>
            ) : null}
            {phone ? (
              <li>
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-1.5 hover:text-text transition-colors"
                >
                  <span aria-hidden>📞</span>
                  <span>{phone}</span>
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 hover:text-text transition-colors"
                >
                  <span aria-hidden>✉️</span>
                  <span className="line-clamp-1">{email}</span>
                </a>
              </li>
            ) : null}
            {website ? (
              <li>
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-text transition-colors"
                >
                  <span aria-hidden>🌐</span>
                  <span className="line-clamp-1">{prettyWebsite(website)}</span>
                </a>
              </li>
            ) : null}
          </ul>
        )}
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
  if (!hex) return "139 90 60"; // default Modern Cafe primary
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
    return "139 90 60";
  }
  return `${r} ${g} ${b}`;
}

/** Strip protocol + trailing slash for display ("moderncafe.com"). */
function prettyWebsite(url: string): string {
  return url
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
    .slice(0, 40);
}
