import type { PublicProductDetailDTO } from "@/features/catalog/data/public-catalog-queries";

const schemaAvailability = {
  IN_STOCK: "https://schema.org/InStock",
  LOW_STOCK: "https://schema.org/LimitedAvailability",
  OUT_OF_STOCK: "https://schema.org/OutOfStock",
} as const;

export function buildProductJsonLd(product: PublicProductDetailDTO, productUrl?: string | null) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    sku: product.sku,
    brand: { "@type": "Brand", name: product.brand.name },
    category: product.componentType.name,
    ...(product.partNumber ? { mpn: product.partNumber } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(product.images.length > 0 ? { image: product.images.map(({ url }) => url) } : {}),
    ...(productUrl ? { url: productUrl } : {}),
  };

  if (product.salePrice !== null) {
    data.offers = {
      "@type": "Offer",
      price: product.salePrice,
      priceCurrency: product.currency,
      availability: schemaAvailability[product.availability.key],
      ...(productUrl ? { url: productUrl } : {}),
    };
  }

  return data;
}

export function buildBreadcrumbJsonLd(
  product: PublicProductDetailDTO,
  homeUrl?: string | null,
  catalogUrl?: string | null,
  productUrl?: string | null,
) {
  const items = [
    { name: "Inicio", url: homeUrl },
    { name: "Catálogo", url: catalogUrl },
    { name: product.title, url: productUrl },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.url ? { item: item.url } : {}),
    })),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

