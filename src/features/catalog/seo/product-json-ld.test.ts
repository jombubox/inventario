import { describe, expect, it } from "vitest";

import type { PublicProductDetailDTO } from "@/features/catalog/data/public-catalog-queries";
import {
  buildProductJsonLd,
  serializeJsonLd,
} from "@/features/catalog/seo/product-json-ld";

const product: PublicProductDetailDTO = {
  slug: "mainboard-bn94",
  sku: "SAM-MB-BN94",
  title: "Mainboard Samsung BN94",
  brand: { name: "Samsung", slug: "samsung" },
  componentType: { name: "Mainboard", slug: "mainboard" },
  partNumber: "BN94",
  description: "Tarjeta <principal>",
  salePrice: "1200.00",
  currency: "MXN",
  primaryImage: null,
  availability: { key: "LOW_STOCK", label: "Pocas piezas" },
  conditions: ["USED_GOOD"],
  images: [],
  compatibilities: [{ brand: "Samsung", model: "UN55" }],
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

describe("product structured data", () => {
  it("includes an Offer only when a real sale price exists", () => {
    const data = buildProductJsonLd(product, "https://catalog.example/catalogo/mainboard-bn94");
    expect(data.offers).toMatchObject({
      price: "1200.00",
      priceCurrency: "MXN",
      availability: "https://schema.org/LimitedAvailability",
    });
    expect(buildProductJsonLd({ ...product, salePrice: null })).not.toHaveProperty("offers");
  });

  it("escapes markup characters before embedding JSON-LD in HTML", () => {
    expect(serializeJsonLd(buildProductJsonLd(product))).not.toContain("<principal>");
    expect(serializeJsonLd(buildProductJsonLd(product))).toContain("\\u003cprincipal>");
  });
});

