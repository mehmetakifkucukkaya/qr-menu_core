import clsx from "clsx";

import { SmartImage } from "@/components/ui/SmartImage";

interface BusinessMarkProps {
  name: string;
  logo?: string | null;
  /** Size, radius and ring of the mark, e.g. "h-8 w-8 rounded-lg". */
  className?: string;
  /** Initial's typography, e.g. "text-sm". */
  initialClassName?: string;
  loading?: "eager" | "lazy";
}

/**
 * BusinessMark — the venue's logo, or a brand-coloured monogram when there is
 * no logo (or it fails to load). The monogram is part of the design, not an
 * error state: a missing or broken logo must never show a broken-image glyph
 * or its alt text. The caller's `className` owns size, radius and the tile
 * colour behind a loaded logo; the monogram brings its own brand-colour fill.
 */
export function BusinessMark({
  name,
  logo,
  className,
  initialClassName = "text-base",
  loading = "lazy",
}: BusinessMarkProps) {
  const initial = (name ?? "").trim().charAt(0).toLocaleUpperCase("tr-TR") || "•";
  return (
    <SmartImage
      src={logo}
      alt=""
      aria-hidden
      loading={loading}
      wrapperClassName={clsx("shrink-0", className)}
      fallback={
        <span
          aria-hidden
          className={clsx(
            "flex h-full w-full items-center justify-center bg-primary font-heading font-semibold leading-none text-primary-foreground",
            initialClassName,
          )}
        >
          {initial}
        </span>
      }
    />
  );
}
