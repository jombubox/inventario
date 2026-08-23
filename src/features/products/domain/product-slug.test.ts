import { describe, expect, it } from "vitest";

import {
  appendSlugCollisionSuffix,
  generateProductSlug,
  resolveStableProductSlug,
} from "@/features/products/domain/product-slug";

const input = {
  componentType: "Mainboard",
  partNumber: "BN94-07820F",
  brand: "Samsung",
  compatibleModel: "UN58H5200SXZX",
  sku: "SAM-MB-BN9407820F",
};

describe("product slug", () => {
  it("generates a semantic slug once", () => {
    expect(generateProductSlug(input)).toBe(
      "mainboard-bn94-07820f-samsung-un58h5200sxzx",
    );
  });

  it("preserves an existing slug after product edits", () => {
    expect(resolveStableProductSlug("stable-product-url", input)).toBe("stable-product-url");
  });

  it("creates a deterministic collision candidate", () => {
    expect(appendSlugCollisionSuffix("stable-product-url", 2)).toBe(
      "stable-product-url-2",
    );
  });
});
