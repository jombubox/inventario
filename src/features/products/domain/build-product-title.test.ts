import { describe, expect, it } from "vitest";

import { buildProductTitle } from "@/features/products/domain/build-product-title";

describe("buildProductTitle", () => {
  it("uses all available product data", () => {
    expect(
      buildProductTitle({
        componentType: "MAINBOARD",
        partNumber: "BN94-07820F",
        brand: "SAMSUNG",
        compatibleModel: "UN58H5200SXZX",
      }),
    ).toBe("MAINBOARD BN94-07820F | SAMSUNG UN58H5200SXZX");
  });

  it("omits a missing part number", () => {
    expect(
      buildProductTitle({
        componentType: "MAINBOARD",
        brand: "SAMSUNG",
        compatibleModel: "UN58H5200SXZX",
      }),
    ).toBe("MAINBOARD | SAMSUNG UN58H5200SXZX");
  });

  it("omits a missing model", () => {
    expect(
      buildProductTitle({
        componentType: "MAINBOARD",
        partNumber: "BN94-07820F",
        brand: "SAMSUNG",
      }),
    ).toBe("MAINBOARD BN94-07820F | SAMSUNG");
  });

  it("cleans whitespace and never leaks empty tokens", () => {
    const title = buildProductTitle({
      componentType: "  Tarjeta   Única ",
      partNumber: "   ",
      brand: " Samsung ",
      compatibleModel: null,
    });

    expect(title).toBe("Tarjeta Única | Samsung");
    expect(title).not.toMatch(/undefined|null|\|\|| {2}/u);
  });
});
