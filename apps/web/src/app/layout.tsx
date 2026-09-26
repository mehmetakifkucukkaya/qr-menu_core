import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "QR Menü",
    template: "%s · QR Menü",
  },
  description: "Modern Cafe için mobil-first dijital menü — QR kod ile açılır, TR/EN çoklu dil, gerçek zamanlı fiyat güncellemesi.",
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
