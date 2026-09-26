import { Phone, MessageCircle } from "lucide-react";
import type { PublicMenuCta } from "@/types/menu";

interface FloatingCtasProps {
  cta: PublicMenuCta;
}

/**
 * FloatingCtas — bottom-floating call + WhatsApp buttons (mobile only).
 *
 * - Hidden on `sm:` and up; the inline header CTAs take over on wider
 *   screens.
 * - Phone uses `tel:` (system dialer on mobile, no-op on desktop).
 * - WhatsApp uses `https://wa.me/{digits}` (works on all platforms;
 *   on desktop opens WhatsApp Web in a new tab).
 *
 * The number strings are kept with their original formatting for the
 * `tel:` href (so the dialer shows the human-readable form) and then
 * stripped of non-digits for the `wa.me/` URL.
 */
export function FloatingCtas({ cta }: FloatingCtasProps) {
  const callPhone = cta.call_phone?.trim();
  const whatsapp = cta.whatsapp?.trim();

  if (!callPhone && !whatsapp) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 sm:hidden">
      <div className="pointer-events-auto flex gap-2 rounded-full bg-surface/95 px-3 py-2 shadow-floating ring-1 ring-border backdrop-blur">
        {callPhone ? (
          <a
            href={`tel:${callPhone.replace(/\s+/g, "")}`}
            className="touch-target inline-flex items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            <Phone className="h-4 w-4" aria-hidden />
            <span>Ara</span>
          </a>
        ) : null}
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp.replace(/[^\d]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="touch-target inline-flex items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            <span>WhatsApp</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}