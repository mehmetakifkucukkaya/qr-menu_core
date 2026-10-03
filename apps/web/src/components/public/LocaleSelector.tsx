"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Globe } from "lucide-react";
import type { LocaleCode } from "@/types/menu";
import { trackEvent } from "@/lib/events";

interface LocaleSelectorProps {
  current: LocaleCode;
  supported?: LocaleCode[];
}

/**
 * LocaleSelector — compact language pill (globe + "TR" + chevron).
 *
 * The visible pill is decoration; the real control is a native <select>
 * stretched invisibly over it. That keeps everything native — the platform's
 * own picker on phones, full keyboard and screen-reader support, and
 * `selectOption` in the browser smoke tests — while the closed state stays
 * small enough for a crowded header (the old pill spelled out "Türkçe ▾" and
 * was twice as wide).
 *
 * Flipping it rewrites the `?locale=` query param and soft-refreshes: the
 * server component reads `searchParams.locale` and rebuilds the payload, so
 * there is no client-side cache to invalidate.
 *
 * Analytics (Sprint 5B): fires `language_change` BEFORE the navigation so the
 * change is still recorded if the transition throws.
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
    trackEvent("language_change", { locale: next });
    startTransition(() => {
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      router.refresh();
    });
  };

  return (
    <div
      className={
        "relative inline-flex h-11 items-center gap-1.5 rounded-pill bg-surface/90 pl-3 pr-2.5 text-sm font-semibold text-text " +
        "shadow-sm ring-1 ring-black/5 backdrop-blur transition duration-200 hover:bg-surface " +
        // The <select> is invisible (opacity 0), so its own focus outline is
        // too. Draw the keyboard focus ring on the visible pill instead.
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary " +
        (isPending ? "opacity-60" : "")
      }
    >
      <Globe className="h-4 w-4 text-primary" aria-hidden />
      <span aria-hidden className="tabular-nums">
        {current.toUpperCase()}
      </span>
      <ChevronDown className="h-3.5 w-3.5 text-outline" aria-hidden />
      <select
        value={current}
        onChange={(e) => handleChange(e.target.value as LocaleCode)}
        disabled={isPending}
        aria-label="Dil seçimi"
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-pill opacity-0"
      >
        {supported.map((code) => (
          <option key={code} value={code}>
            {code === "tr" ? "Türkçe" : "English"}
          </option>
        ))}
      </select>
    </div>
  );
}
