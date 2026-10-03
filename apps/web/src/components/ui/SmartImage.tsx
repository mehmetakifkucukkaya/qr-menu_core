"use client";

import clsx from "clsx";
import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type ReactNode,
} from "react";
import { UtensilsCrossed } from "lucide-react";

import { mediaSrc } from "@/lib/media-url";

/**
 * SmartImage — an <img> that never shows the browser's "broken image" glyph.
 *
 * - While loading: a shimmer skeleton sits behind the image.
 * - Missing `src`, or the request fails: `fallback` is shown instead (a quiet
 *   icon tile by default) so the layout keeps its size and no alt text leaks
 *   into the design.
 *
 * Why the extra effect: the image is part of the server-rendered HTML, so the
 * browser can finish — or fail — loading it BEFORE React hydrates and attaches
 * `onError`. In that case the event is never delivered and the broken glyph
 * stays. On mount we therefore also inspect `img.complete` / `naturalWidth`.
 *
 * `src` goes through `mediaSrc()`: an old upload saved with a loopback origin
 * (`http://localhost:3000/media/…`) is turned into a same-origin `/media/…` path
 * that actually resolves.
 *
 * The wrapper owns size, radius and background (`wrapperClassName`); the image
 * fills it. A custom `fallback` is centred inside the wrapper, so the caller
 * decides its colour (e.g. a brand-coloured monogram tile).
 */

type Status = "loading" | "loaded" | "error";

interface SmartImageProps
  extends Omit<
    ImgHTMLAttributes<HTMLImageElement>,
    "src" | "alt" | "onError" | "onLoad"
  > {
  src?: string | null;
  alt: string;
  /** Rendered instead of the image when it is missing or fails to load. */
  fallback?: ReactNode;
  /** Size / radius / ring of the box. The image fills it. */
  wrapperClassName?: string;
}

export function SmartImage({
  src: rawSrc,
  alt,
  fallback,
  wrapperClassName,
  className,
  loading = "lazy",
  ...rest
}: SmartImageProps) {
  const src = mediaSrc(rawSrc);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<Status>(src ? "loading" : "error");

  useEffect(() => {
    if (!src) {
      setStatus("error");
      return;
    }
    const img = imgRef.current;
    if (img?.complete) {
      setStatus(img.naturalWidth > 0 ? "loaded" : "error");
    } else {
      setStatus("loading");
    }
  }, [src]);

  if (!src || status === "error") {
    return (
      <div className={clsx("relative overflow-hidden", wrapperClassName)}>
        {fallback ? (
          <div className="flex h-full w-full items-center justify-center">
            {fallback}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-low text-outline/70">
            <UtensilsCrossed className="h-1/3 w-1/3" aria-hidden />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={clsx("relative overflow-hidden", wrapperClassName)}>
      {status === "loading" ? (
        <div aria-hidden className="skeleton absolute inset-0" />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={clsx("relative h-full w-full object-cover", className)}
        {...rest}
      />
    </div>
  );
}
