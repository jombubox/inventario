import type { Metadata } from "next";
import { Google_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { themeInitializationScript } from "@/features/theme/theme";
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
  title: { default: "Jombubox", template: "%s | Jombubox" },
  description: "Catálogo técnico público de refacciones electrónicas Jombubox.",
  applicationName: "Jombubox",
  creator: "Jombubox",
  publisher: "Jombubox",
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Jombubox",
    title: "Jombubox",
    description: "Catálogo técnico público de refacciones electrónicas Jombubox.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Jombubox · Catálogo técnico" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Jombubox",
    description: "Catálogo técnico público de refacciones electrónicas Jombubox.",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="es"
      className={googleSans.variable}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
