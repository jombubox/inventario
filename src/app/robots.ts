import type { MetadataRoute } from "next";

import { absoluteSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const sitemapUrl = absoluteSiteUrl("/sitemap.xml");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/catalogo", "/catalogo/"],
      disallow: ["/admin", "/login", "/api/"],
    },
    ...(sitemapUrl ? { sitemap: sitemapUrl } : {}),
  };
}
