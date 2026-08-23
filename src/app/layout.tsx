import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { getSiteUrl } from "@/lib/site-url";

import "./globals.css";

const googleSans = Google_Sans({
  variable: "--font-google-sans",
  weight: "variable",
  subsets: ["latin"],
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: siteUrl } : {}),
  title: { default: "JombuBox", template: "%s | JombuBox" },
  description: "Catálogo técnico público de refacciones electrónicas JombuBox.",
  applicationName: "JombuBox",
  creator: "JombuBox",
  publisher: "JombuBox",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "JombuBox",
    title: "JombuBox",
    description: "Catálogo técnico público de refacciones electrónicas JombuBox.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "JombuBox · Catálogo técnico" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "JombuBox",
    description: "Catálogo técnico público de refacciones electrónicas JombuBox.",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" className={googleSans.variable} data-scroll-behavior="smooth">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
