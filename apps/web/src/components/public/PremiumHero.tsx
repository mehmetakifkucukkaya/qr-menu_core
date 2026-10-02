import type { PublicMenuBusiness, PublicMenuTheme } from "@/types/menu";
import { generatePlaceholderSvg } from "@/lib/placeholder";

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
  // Only render the <img> when the tenant uploaded a real cover image.
  // Inline-SVG placeholders (1.2kB base64 every render) were bloating
  // the DOM and producing a never-ending "loading" feel.
  const hasRealCover =
    Boolean(business.cover_image) &&
    !business.cover_image!.startsWith("data:");

  const hasRealLogo =
    Boolean(business.logo) && !business.logo!.startsWith("data:");

  const logoSrc = hasRealLogo
    ? business.logo!
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
      {/* ── Operational sub-header strip (Velouté desktop pattern) ──
       *  Mobile-first means the strip is *dense* on small screens:
       *   • single line (no flex-wrap) until `md`
       *   • address / saat pills collapse behind the cursor on mobile
       *   • TR + masa chip stay visible (compact 36px pill) */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-low)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 text-xs sm:px-6 sm:text-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold uppercase tracking-wider text-primary">
              <span
                aria-hidden
                className="inline-block h-2 w-2 animate-pulse rounded-full bg-secondary"
              />
              Servis Aktif
            </span>
            <span className="hidden truncate text-on-surface-variant sm:inline">
              08:30 – 23:00
            </span>
            {address ? (
              <span className="hidden items-center gap-1 truncate text-outline md:inline-flex">
                <span aria-hidden>📍</span>
                <span className="truncate">{address}</span>
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Currency display — Turkish-first, no selector (D-035). */}
            <div className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[10px] font-bold uppercase tracking-wider text-primary shadow-sm sm:h-8 sm:text-xs">
              <span aria-hidden>₺</span>
              <span>{currency}</span>
            </div>
            {/* Table context chip — visible on sm+ to free up chrome on phones. */}
            <div className="hidden h-7 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-semibold text-primary shadow-sm sm:inline-flex sm:h-8">
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
        {/* Real cover image — only when the tenant uploaded one.
         * When there's no image we rely on the gradient + noise + warm
         * wash layers below for visual depth instead of a 1.2kB SVG
         * data URI that bloats the DOM. */}
        {hasRealCover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={business.cover_image!}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-25 mix-blend-luminosity"
            loading="eager"
            decoding="async"
          />
        ) : null}
        {/* Right-side warm wash */}
        <div
          aria-hidden
          className="absolute -right-12 -bottom-16 h-72 w-72 rounded-full bg-secondary/20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-white/15 to-transparent"
        />

        <div className="relative z-10 mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-8 sm:px-6 sm:py-10 md:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-fixed backdrop-blur-md">
            <span aria-hidden>🍂</span>
            Sonbahar Menüsü
          </span>
          <h2 className="max-w-xl font-heading text-xl font-semibold leading-tight tracking-tight text-primary-foreground sm:text-3xl md:text-4xl">
            Taş değirmen unları, ormandan toplanan kökler ve Galata ocağı.
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-primary-fixed/80 sm:text-base">
            Her sabah 05:00&apos;te başlıyoruz — ekşi mayalı köy ekmeği, Bolu
            dağ köylerinin çalkalanmış tereyağı, kavrulmuş kahve.
          </p>
          <div className="hidden items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-primary-fixed/70 sm:flex">
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

      {/* ── Title block + quick-action pill row ──
       *  Mobile: title bumps to 2xl, description 2 lines, pills fill
       *  the row edge-to-edge (gap-2 instead of centered). */}
      <div className="relative mx-auto max-w-6xl px-4 pt-4 pb-6 text-center sm:px-6 sm:pt-6 sm:pb-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
          Bistro &amp; Pâtisserie
        </p>
        <h1
          id="business-name"
          className="mt-2 font-heading text-2xl font-semibold tracking-tight text-primary sm:text-4xl md:text-5xl"
        >
          {business.name}
        </h1>
        {description ? (
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant sm:text-base">
            {description}
          </p>
        ) : null}

        {/* Quick-action pill row — mobile full-width stack, sm+ inline */}
        <div className="mt-5 grid grid-cols-1 gap-2 sm:mt-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-2">
          {address ? (
            <a
              href={mapsUrl || "#"}
              target={mapsUrl ? "_blank" : undefined}
              rel={mapsUrl ? "noopener noreferrer" : undefined}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-text shadow-sm transition hover:bg-[var(--color-surface-low)] active:scale-[0.98]"
            >
              <span aria-hidden>📍</span>
              <span className="line-clamp-1">{address}</span>
            </a>
          ) : null}
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, "")}`}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-text shadow-sm transition hover:bg-[var(--color-surface-low)] active:scale-[0.98]"
            >
              <span aria-hidden>📞</span>
              <span>Ara</span>
            </a>
          ) : null}
          <a
            href="#contact"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-pill border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-text shadow-sm transition hover:bg-[var(--color-surface-low)] active:scale-[0.98]"
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
