import clsx from "clsx";
import type { ReactNode } from "react";

/**
 * Container — Sprint 12A primitive.
 *
 * Centered, max-width wrapper. Replaces ad-hoc `mx-auto max-w-*` classes
 * scattered through pages. Sizes are tuned for the V2 admin:
 *   - sm  →  3xl  — forms, single-column mobile (login, magic-link)
 *   - md  →  5xl  — detail pages (customer profile, order detail)
 *   - lg  →  7xl  — default admin content width (menus, items)
 *   - xl  → 1400 — public menu hero, dashboard wide layouts
 *
 * Horizontal padding tracks the existing Tailwind breakpoints (sm/lg)
 * so the gutter scales with viewport.
 */

type ContainerSize = "sm" | "md" | "lg" | "xl";

interface ContainerProps {
  size?: ContainerSize;
  className?: string;
  children?: ReactNode;
  /** Render as a `<section>` for landmarks, or stay a `<div>` (default). */
  as?: "div" | "section" | "main";
  /** Native id for skip-to-content / fragment navigation. */
  id?: string;
}

const sizeMap: Record<ContainerSize, string> = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-[1400px]",
};

export function Container({
  size = "lg",
  className,
  children,
  as: Tag = "div",
  id,
}: ContainerProps) {
  return (
    <Tag
      id={id}
      className={clsx(
        "mx-auto w-full px-4 sm:px-6 lg:px-8",
        sizeMap[size],
        className,
      )}
    >
      {children}
    </Tag>
  );
}