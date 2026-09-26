"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import type { LocaleCode } from "@/types/menu";
import { trackEvent } from "@/lib/events";

interface LocaleSelectorProps {
  current: LocaleCode;
  supported?: LocaleCode[];
}

/**
 * LocaleSelector — top-right dropdown that flips the `?locale=` query
 * param and triggers a soft refresh via router.refresh().
 *
 * The server component reads `searchParams.locale` and rebuilds the
 * payload with the new locale, so we don't need a client-side cache
 * to invalidate. The transition keeps the previous render alive for
 * ~250ms which gives a "skeleton flash" feel — acceptable in V1.
 *
 * Analytics (Sprint 5B): fires `language_change` when the user picks
 * a non-current locale. The event is sent BEFORE the navigation so we
 * still record the change even if the page transition throws.
 */
export function LocaleSelector({
  current,
  supported = ["tr", "en"],
}: LocaleSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: LocaleCode) => {
    if (next === current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "tr") {
      // Default locale — drop the param entirely so the URL stays clean.
      params.delete("locale");
    } else {
      params.set("locale", next);
    }
    const qs = params.toString();
    // Fire analytics first — keepalive on the fetch in `trackEvent`
    // means it survives the navigation if the user clicks through fast.
    trackEvent("language_change", { locale: next });
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      router.refresh();
    });
  };

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">Dil seçimi</span>
      <Globe
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted"
        aria-hidden
      />
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value as LocaleCode)}
        disabled={isPending}
        aria-label="Dil seçimi"
        className="touch-target cursor-pointer appearance-none rounded-full border border-border bg-surface py-1.5 pl-8 pr-7 text-sm font-medium text-text transition hover:bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
      >
        {supported.map((code) => (
          <option key={code} value={code}>
            {code === "tr" ? "Türkçe" : "English"}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 text-xs text-muted"
      >
        ▾
      </span>
    </label>
  );
}