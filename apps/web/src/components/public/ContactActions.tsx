"use client";

import clsx from "clsx";
import { Instagram, MapPin, MessageCircle, Phone } from "lucide-react";
import type { ReactNode } from "react";

import { trackEvent } from "@/lib/events";
import type { PublicMenuBusiness, PublicMenuCta } from "@/types/menu";

interface ContactActionsProps {
  business: Pick<PublicMenuBusiness, "phone" | "address" | "google_maps_url">;
  cta: PublicMenuCta;
  /**
   * tiles — equal-width labelled tiles under the hero title
   * icons — compact round buttons for the bottom dock
   */
  variant: "tiles" | "icons";
  className?: string;
}

interface Action {
  key: string;
  label: string;
  href: string;
  external: boolean;
  icon: ReactNode;
  onClick?: () => void;
}

/** Digits only, the form `https://wa.me/` expects. */
function whatsappHref(raw: string): string {
  return `https://wa.me/${raw.replace(/[^\d]/g, "")}`;
}

/**
 * Builds the list of contact actions from tenant data. An action appears only
 * when its data exists — nothing is hard-coded and nothing is a dead link.
 */
function buildActions(
  business: ContactActionsProps["business"],
  cta: PublicMenuCta,
  iconClass: string,
): Action[] {
  const actions: Action[] = [];

  const address = business.address?.trim();
  const mapsUrl = business.google_maps_url?.trim();
  if (mapsUrl || address) {
    actions.push({
      key: "directions",
      label: "Yol tarifi",
      href:
        mapsUrl ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address!)}`,
      external: true,
      icon: <MapPin className={iconClass} aria-hidden />,
    });
  }

  const phone = (cta.call_phone || business.phone || "").trim();
  if (phone) {
    actions.push({
      key: "call",
      label: "Ara",
      href: `tel:${phone.replace(/\s+/g, "")}`,
      external: false,
      icon: <Phone className={iconClass} aria-hidden />,
      onClick: () => trackEvent("phone_click"),
    });
  }

  const whatsapp = cta.whatsapp?.trim();
  if (whatsapp) {
    actions.push({
      key: "whatsapp",
      label: "WhatsApp",
      href: whatsappHref(whatsapp),
      external: true,
      icon: <MessageCircle className={iconClass} aria-hidden />,
      onClick: () => trackEvent("whatsapp_click"),
    });
  }

  const instagram = cta.instagram?.trim();
  if (instagram) {
    actions.push({
      key: "instagram",
      label: "Instagram",
      href: instagram,
      external: true,
      icon: <Instagram className={iconClass} aria-hidden />,
    });
  }

  return actions;
}

/** True when the bottom dock has a call or WhatsApp button to show. */
export function hasDockContact(
  business: ContactActionsProps["business"],
  cta: PublicMenuCta,
): boolean {
  return buildActions(business, cta, "").some(
    (a) => a.key === "call" || a.key === "whatsapp",
  );
}

/**
 * ContactActions — directions / call / WhatsApp / Instagram, one component for
 * both the hero (labelled tiles) and the bottom dock (icon buttons), so the
 * links, tracking and availability rules can never drift apart.
 */
export function ContactActions({
  business,
  cta,
  variant,
  className,
}: ContactActionsProps) {
  const actions = buildActions(
    business,
    cta,
    variant === "tiles" ? "h-5 w-5" : "h-[1.35rem] w-[1.35rem]",
  );
  if (actions.length === 0) return null;

  if (variant === "icons") {
    return (
      <>
        {actions
          .filter((a) => a.key === "call" || a.key === "whatsapp")
          .map((action) => (
            <a
              key={action.key}
              href={action.href}
              target={action.external ? "_blank" : undefined}
              rel={action.external ? "noopener noreferrer" : undefined}
              onClick={action.onClick}
              aria-label={action.label}
              className={clsx(
                "inline-flex h-11 w-11 items-center justify-center rounded-full text-primary",
                "transition duration-200 hover:bg-primary-soft active:scale-95",
                className,
              )}
            >
              {action.icon}
            </a>
          ))}
      </>
    );
  }

  return (
    <ul
      className={clsx(
        "grid gap-2.5",
        actions.length >= 4
          ? "grid-cols-4"
          : actions.length === 3
            ? "grid-cols-3"
            : actions.length === 2
              ? "grid-cols-2"
              : "grid-cols-1",
        className,
      )}
    >
      {actions.map((action) => (
        <li key={action.key}>
          <a
            href={action.href}
            target={action.external ? "_blank" : undefined}
            rel={action.external ? "noopener noreferrer" : undefined}
            onClick={action.onClick}
            className={clsx(
              "flex h-[4.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface text-[0.8125rem] font-semibold text-text",
              "shadow-card ring-1 ring-border/70 transition duration-200",
              "hover:shadow-md hover:ring-border-strong active:scale-[0.97] active:shadow-sm",
              "sm:h-14 sm:flex-row sm:gap-2 sm:px-4",
            )}
          >
            <span className="text-primary">{action.icon}</span>
            <span className="truncate">{action.label}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
