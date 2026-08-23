import type { MetadataRoute } from "next";

import { getDb } from "@/db";
import { getPublicProductSitemapEntries } from "@/features/catalog/data/public-catalog-queries";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  if (!siteUrl) return [];

  const productRows = await getPublicProductSitemapEntries(getDb());
  return [
    { url: new URL("/", siteUrl).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/catalogo", siteUrl).toString(), changeFrequency: "daily", priority: 0.9 },
    ...productRows.map((product) => ({
      url: new URL(`/catalogo/${product.slug}`, siteUrl).toString(),
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

