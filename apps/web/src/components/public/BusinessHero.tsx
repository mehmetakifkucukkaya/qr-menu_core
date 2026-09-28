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
 * BusinessHero — cover image, logo, business name, and per-business theme
 * override (via inline CSS variables on the wrapper).
 *
 * The theme override is deliberately scoped to this subtree so the rest of
 * the page keeps the Modern Cafe defaults from src/styles/tokens.css. When
 * the backend payload carries a `theme` object (Sprint 6 demo seed), it
 * wins; otherwise we render with the default palette.
 *
 * Sprint A (Faz 1.1 + Faz 2.1):
 *   - `cover_image` is honored as a separate field (was being driven by the
 *     logo fallback chain — wrong, the logo was rendering as the cover).
 *   - `logo` / `cover_image` fall back to SVG placeholders only when the
 *     payload itself is missing the field (no more double-placeholder when
 *     admin uploaded one but not the other).
 *   - Short description, address, Google Maps link, website, email, phone
 *     render in a tight contact strip below the name. Empty fields are
 *     dropped so we don't show " · " separators next to nothing.
 */
export function BusinessHero({ business, theme }: BusinessHeroProps) {
  const coverSrc =
    business.cover_image && !business.cover_image.startsWith("data:")
      ? business.cover_image
      : getBusinessCoverPlaceholder(business.slug);

  const logoSrc =
    business.logo && !business.logo.startsWith("data:")
      ? business.logo
      : generatePlaceholderSvg({
          emoji: business.name.charAt(0).toUpperCase() || "M",
          color1: "#D4A574",
          color2: "#8B5A3C",
          size: 200,
          label: `${business.name} logo`,
        });

  // Inline CSS variables so a per-business theme can override without
  // re-rendering or affecting other tenants on the page.
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
      className="relative w-full overflow-hidden bg-surface"
      style={themeStyle}
      aria-labelledby="business-name"
    >
      <div className="relative h-44 w-full sm:h-56">
        {/* Using a plain <img> instead of next/image for the placeholder data
            URL — next/image can't optimize inline SVG data URLs in V1. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverSrc}
          alt={`${business.name} kapak görseli`}
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"
        />
      </div>

      <div className="relative -mt-12 flex flex-col items-center px-4 pb-6">
        <div className="ring-4 ring-surface rounded-full overflow-hidden bg-surface shadow-card w-24 h-24 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt={`${business.name} logo`}
            className="h-full w-full object-cover"
          />
        </div>
        <h1
          id="business-name"
          className="mt-3 font-heading text-2xl font-bold text-text sm:text-3xl"
        >
          {business.name}
        </h1>
        {description ? (
          <p className="mt-2 max-w-md text-center text-sm text-muted sm:text-base">
            {description}
          </p>
        ) : null}
        <p className="mt-1 text-xs uppercase tracking-wider text-muted">
          {business.currency} · QR Menü
        </p>

        {(address || mapsUrl || website || email || phone) && (
          <ul className="mt-4 flex w-full max-w-md flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
            {address ? (
              <li>
                {mapsUrl ? (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline-offset-2 hover:text-text hover:underline"
                  >
                    <span aria-hidden>📍</span>
                    <span className="line-clamp-1">{address}</span>
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1">
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
                  className="inline-flex items-center gap-1 hover:text-text hover:underline"
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
                  className="inline-flex items-center gap-1 hover:text-text hover:underline"
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
                  className="inline-flex items-center gap-1 hover:text-text hover:underline"
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