/**
 * Next.js configuration for the QR Menu public frontend.
 *
 * - `output: "standalone"` produces a minimal server bundle suitable for
 *   Docker (D-007, see DECISIONS.md).
 * - `reactStrictMode` surfaces side-effect bugs early in dev.
 * - `images.remotePatterns` is permissive for V1; tighten in Sprint 5+ once
 *   image hosting is finalized.
 *
 * Note: Next 14.x doesn't support `next.config.ts` — that's a Next 15
 * feature. We use `.mjs` here.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
