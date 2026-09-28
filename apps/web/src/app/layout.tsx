/* eslint-disable @next/next/no-page-custom-font --
 * App Router (Next 14) uses the <link> + preconnect pattern in <head>;
 * this lint rule targets the Pages Router's _document.js. */

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

/**
 * The root layout is responsible for four Sprint 12A concerns:
 *   1. Google Fonts pairing (Playfair Display SC heading + Karla body)
 *      with the canonical preconnect hints — keeps LCP honest.
 *   2. `data-theme` SSR — read the user's chosen theme from the
 *      `qr-menu-theme` cookie (set by `useThemeStore`'s `persist`
 *      middleware on the client) and write it onto `<html>` so the
 *      first paint already matches the user's preference. No FOUC.
 *   3. A skip-to-content link — anchors `<main id="main-content">` so
 *      keyboard users can jump past the admin nav / sticky header.
 *   4. The `<ThemeProvider>` wrapper — picks up live theme changes
 *      from the Zustand store on the client and toggles the
 *      `data-theme` attribute as needed.
 *
 * Reading cookies here forces the route into dynamic rendering, which is
 * already the case for the admin shell (`force-dynamic` on the inner
 * layout) and the public menu page (server-fetches menu payload per
 * request), so there is no extra build-time regression.
 */

export const metadata: Metadata = {
  title: {
    default: "QR Menü",
    template: "%s · QR Menü",
  },
  description:
    "Modern Cafe için mobil-first dijital menü — QR kod ile açılır, TR/EN çoklu dil, gerçek zamanlı fiyat güncellemesi.",
  applicationName: "QR Menü",
  keywords: ["qr menu", "dijital menü", "cafe", "restoran", "modern cafe", "türkiye"],
  authors: [{ name: "Modern Cafe" }],
  creator: "Modern Cafe",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "tr_TR",
    url: "/",
    siteName: "QR Menü",
    images: [
      {
        url: "/demo-assets/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Modern Cafe dijital menü",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/demo-assets/og-image.jpg"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [
      { url: "/demo-assets/modern-cafe-logo.webp", type: "image/webp" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/demo-assets/modern-cafe-logo.webp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#8B5A3C",
};

/** Read the persisted theme preference from the cookie that the
 *  client-side `useThemeStore` writes via Zustand's `persist` middleware.
 *  Falls back to `light` when the cookie is missing or malformed. */
function resolveInitialTheme(): "light" | "dark" | "system" {
  const raw = cookies().get("qr-menu-theme")?.value;
  if (!raw) return "light";
  // The persisted blob is JSON; we only need the `theme` field, so a cheap
  // string scan avoids pulling JSON.parse + validation into the root layout.
  // Acceptable inputs: "light", "dark", "system".
  if (raw.includes('"theme":"dark"')) return "dark";
  if (raw.includes('"theme":"system"')) return "system";
  return "light";
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const initialTheme = resolveInitialTheme();

  return (
    <html lang="tr" data-theme={initialTheme === "system" ? undefined : initialTheme}>
      <head>
        {/* Google Fonts — Playfair Display SC (heading brand) + Karla (UI body).
         *  The App Router (Next 14) uses the <link> approach for self-hosted
         *  preconnect + stylesheet hints. The next/font loader is an alternative
         *  but adds bundle weight for a small marketing-style site, so we keep
         *  this pattern (the lint rule targets the Pages router). */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Karla:wght@300;400;500;600;700&family=Playfair+Display+SC:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <a href="#main-content" className="skip-to-content">
          İçeriğe geç
        </a>
        <ThemeProvider defaultTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}