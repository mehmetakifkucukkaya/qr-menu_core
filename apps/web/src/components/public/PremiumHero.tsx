import clsx from "clsx";
import { MapPin, UtensilsCrossed } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { mediaSrc } from "@/lib/media-url";
import type {
  PublicMenuBusiness,
  PublicMenuCta,
  PublicMenuTheme,
} from "@/types/menu";
import { BusinessMark } from "./BusinessMark";
import { ContactActions } from "./ContactActions";

interface PremiumHeroProps {
  business: PublicMenuBusiness;
  theme: PublicMenuTheme | null;
  cta: PublicMenuCta;
  /** Name of the menu being shown (a venue can publish several). */
  menuName?: string | null;
}

/**
 * PremiumHero — the venue's identity block at the top of the public menu.
 *
 *   ┌──────────────────────────────────────────┐
 *   │  cover (photo, or brand artwork)         │  ← the sticky header floats
 *   │                                          │    over this, transparent
 *   │ ┌────┐                                   │
 *   └─┤logo├───────────────────────────────────┘
 *     └────┘
 *     Venue name (serif)
 *     Description · address
 *     [Yol tarifi] [Ara] [WhatsApp] [Instagram]
 *
 * Everything shown comes from the tenant's own data; an action tile appears
 * only when its data exists. (The design mock's hard-coded copy — "Servis
 * Aktif", opening hours, "Masa #08", a chef's name — was removed in Faz 0,
 * ANALYSIS_1 F-13, and the WhatsApp tile used to be a dead `#contact` link,
 * F-14: it now opens the tenant's real WhatsApp number.)
 *
 * Per-business theme: the tenant's colours are applied as CSS variables on
 * this section. Only the colours the tenant actually set are overridden, and
 * the text colour used on top of their primary is derived for contrast.
 */
export function PremiumHero({ business, theme, cta, menuName }: PremiumHeroProps) {
  const hasRealCover =
    Boolean(business.cover_image) && !business.cover_image!.startsWith("data:");

  const description = business.description?.trim() ?? "";
  const address = business.address?.trim() ?? "";

  return (
    <section
      className="relative w-full bg-background font-body text-text"
      style={themeVars(theme)}
      aria-labelledby="business-name"
    >
      {/* ── Cover ─────────────────────────────────────────────── */}
      <div
        className={clsx(
          "relative overflow-hidden bg-primary",
          // A photo earns more height; brand artwork stays a slim band.
          hasRealCover ? "h-44 sm:h-60 lg:h-72" : "h-36 sm:h-44 lg:h-48",
        )}
      >
        {hasRealCover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={mediaSrc(business.cover_image) ?? undefined}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        ) : (
          <CoverArtwork />
        )}
        {/* Darkens a photo so the floating header buttons stay legible on any
            image. The artwork is already dark, so it needs no scrim. */}
        {hasRealCover ? (
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/25"
          />
        ) : null}
      </div>

      {/* ── Identity ──────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-4 pb-7 sm:px-6 sm:pb-10">
        <BusinessMark
          name={business.name}
          logo={business.logo}
          loading="eager"
          className="relative z-raised -mt-11 h-[5.5rem] w-[5.5rem] rounded-3xl bg-surface shadow-lg ring-4 ring-background sm:-mt-14 sm:h-28 sm:w-28"
          initialClassName="text-4xl sm:text-5xl"
        />

        <div className="mt-4 sm:mt-5">
          {menuName ? (
            <Badge
              tone="primary"
              icon={<UtensilsCrossed className="h-3 w-3" aria-hidden />}
              className="mb-3"
            >
              {menuName}
            </Badge>
          ) : null}
          <h1
            id="business-name"
            className="font-heading text-[2rem] font-semibold leading-[1.1] tracking-tight text-text sm:text-5xl"
          >
            {business.name}
          </h1>
          {description ? (
            <p className="mt-2.5 max-w-2xl text-base leading-relaxed text-muted">
              {description}
            </p>
          ) : null}
          {address ? (
            <p className="mt-3 flex max-w-2xl items-start gap-2 text-sm text-muted">
              <MapPin
                className="mt-0.5 h-4 w-4 shrink-0 text-outline"
                aria-hidden
              />
              <span>{address}</span>
            </p>
          ) : null}
        </div>

        <ContactActions
          variant="tiles"
          business={business}
          cta={cta}
          className="mt-6 sm:max-w-xl"
        />
      </div>
    </section>
  );
}

/**
 * Brand artwork shown when the venue has no cover photo: layered brand-colour
 * glows over a dotted grid. Pure CSS (no image request, no data-URI weight).
 */
function CoverArtwork() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-accent" />
      <div className="absolute -right-12 -top-24 h-72 w-72 rounded-full bg-secondary/50 mix-blend-screen blur-3xl" />
      <div className="absolute -bottom-32 left-1/4 h-80 w-96 rounded-full bg-accent blur-3xl" />
      <div
        className="absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_85%)]"
        style={{
          backgroundImage:
            "radial-gradient(rgb(255 255 255 / 0.22) 1px, transparent 1.5px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}

/* ── Tenant theme → CSS variables ──────────────────────────────────────── */

type Rgb = [number, number, number];

/** "#RRGGBB" / "#RGB" → [r, g, b], or null when it isn't a hex colour. */
function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const cleaned = hex.replace("#", "").trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black text, whichever reads better on `background`. */
function readableOn(background: Rgb): Rgb {
  const white: Rgb = [255, 255, 255];
  const ink: Rgb = [26, 30, 33];
  return contrast(background, white) >= contrast(background, ink) ? white : ink;
}

function themeVars(theme: PublicMenuTheme | null): React.CSSProperties {
  if (!theme) return {};
  const vars: Record<string, string> = {};
  const fields: Array<[string | null | undefined, string]> = [
    [theme.primary_color, "--color-primary"],
    [theme.secondary_color, "--color-secondary"],
    [theme.accent_color, "--color-accent"],
    [theme.background_color, "--color-background"],
    [theme.text_color, "--color-text"],
  ];
  for (const [hex, name] of fields) {
    const rgb = parseHex(hex);
    if (rgb) vars[name] = rgb.join(" ");
  }
  const primary = parseHex(theme.primary_color);
  if (primary) vars["--color-primary-foreground"] = readableOn(primary).join(" ");
  return vars as React.CSSProperties;
}
