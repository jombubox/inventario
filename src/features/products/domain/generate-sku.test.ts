import { describe, expect, it } from "vitest";

import { InvalidSkuInputError } from "@/features/products/domain/domain-errors";
import {
  assessSkuCollision,
  generateSku,
  resolveStableSku,
} from "@/features/products/domain/generate-sku";

describe("generateSku", () => {
  it("generates a Samsung mainboard SKU from a part number", () => {
    expect(
      generateSku({ brandCode: "SAM", componentCode: "MB", partNumber: "BN94-07820F" }),
    ).toBe("SAM-MB-BN9407820F");
  });

  it("generates an LG power supply SKU", () => {
    expect(
      generateSku({ brandCode: "LG", componentCode: "PSU", partNumber: "EAY65895567" }),
    ).toBe("LG-PSU-EAY65895567");
  });

  it("uses the compatible model when the part number is missing", () => {
    expect(
      generateSku({
        brandCode: "SAM",
        componentCode: "MB",
        compatibleModel: "UN58H5200SXZX",
      }),
    ).toBe("SAM-MB-UN58H5200SXZX");
  });

  it("uses only an explicit controlled fallback", () => {
    expect(
      generateSku({ brandCode: "HIS", componentCode: "IR", controlledFallback: "LEGACY 0042" }),
    ).toBe("HIS-IR-LEGACY0042");
  });

  it("rejects insufficient identity data with a domain error", () => {
    expect(() => generateSku({ brandCode: "SAM", componentCode: "MB" })).toThrow(
      InvalidSkuInputError,
    );
    expect(() =>
      generateSku({ brandCode: "S", componentCode: "MB", partNumber: "123" }),
    ).toThrow(/Brand code/u);
  });

  it("preserves an existing business SKU", () => {
    expect(
      resolveStableSku("CUSTOM-IDENTITY-01", {
        brandCode: "LG",
        componentCode: "PSU",
        partNumber: "CHANGED",
      }),
    ).toBe("CUSTOM-IDENTITY-01");
  });
});

describe("assessSkuCollision", () => {
  it("creates when there is no collision", () => {
    expect(assessSkuCollision({ baseSku: "SAM-MB-ABC123" })).toEqual({
      action: "CREATE",
      sku: "SAM-MB-ABC123",
    });
  });

  it("reuses the same product identity", () => {
    expect(
      assessSkuCollision({
        baseSku: "SAM-MB-ABC123",
        collision: { productId: "product-1", sameProductIdentity: true },
      }),
    ).toMatchObject({ action: "REUSE", productId: "product-1" });
  });

  it("requires review and only proposes a suffix for a different product", () => {
    expect(
      assessSkuCollision({
        baseSku: "SAM-MB-ABC123",
        collision: { productId: "product-2", sameProductIdentity: false },
        nextOrdinal: 3,
      }),
    ).toEqual({
      action: "REVIEW",
      baseSku: "SAM-MB-ABC123",
      candidateSku: "SAM-MB-ABC123-03",
      collidedProductId: "product-2",
    });
  });
});
