"use client";

import { useEffect, useState } from "react";

/** Distance below the sticky chrome at which a section counts as "current". */
const READING_OFFSET = 24;

/**
 * Which category section is the reader currently on?
 *
 * Scroll-spy over the `#category-{slug}` sections. A section becomes active
 * once its top edge passes the "reading line" — the bottom of the sticky
 * header (and of the category chip row, when that is shown) plus a small
 * margin. Measuring the real elements keeps this correct when the chip row is
 * hidden on desktop and the left rail takes over.
 *
 * Both the chip row and the desktop rail read this one value, so they can
 * never disagree (the rail used to hard-code the first category as active).
 */
export function useCategorySpy(slugs: string[]): string | null {
  const [active, setActive] = useState<string | null>(slugs[0] ?? null);
  const key = slugs.join("|");

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (list.length === 0) return;

    let frame = 0;

    const readingLine = () => {
      const header = document.querySelector<HTMLElement>("[data-menu-header]");
      const nav = document.querySelector<HTMLElement>("[data-category-nav]");
      const headerHeight = header?.offsetHeight ?? 56;
      // offsetParent is null while the chip row is display:none (desktop).
      const navHeight = nav && nav.offsetParent !== null ? nav.offsetHeight : 0;
      return headerHeight + navHeight + READING_OFFSET;
    };

    const update = () => {
      frame = 0;
      const line = readingLine();
      let current = list[0];
      for (const slug of list) {
        const el = document.getElementById(`category-${slug}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = slug;
        else break;
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);

  return active;
}
