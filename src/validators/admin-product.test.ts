import { describe, expect, it } from "vitest";

import { CUSTOM_CATALOG_VALUE } from "@/features/products/domain/catalog-selection";
import { createProductMutationSchema } from "@/validators/admin-product";

const catalogId = "10000000-0000-4000-8000-000000000001";
const baseInput = {
  brandId: catalogId,
  componentTypeId: catalogId,
  partNumber: "PN-1",
  title: null,
  description: null,
  salePrice: null,
  currency: "MXN",
  status: "DRAFT" as const,
  isPublic: false,
  compatibilities: [],
};

describe("product custom catalog validation", () => {
  it("keeps existing catalog selections compatible", () => {
    expect(createProductMutationSchema.safeParse(baseInput).success).toBe(true);
  });

  it("requires and trims names for custom selections", () => {
    const parsed = createProductMutationSchema.parse({
      ...baseInput,
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "  Marca   Personalizada  ",
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: "  Módulo   especial ",
    });

    expect(parsed.customBrandName).toBe("Marca Personalizada");
    expect(parsed.customComponentTypeName).toBe("Módulo especial");

    const invalid = createProductMutationSchema.safeParse({
      ...baseInput,
      brandId: CUSTOM_CATALOG_VALUE,
      customBrandName: "   ",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      expect(invalid.error.flatten().fieldErrors.customBrandName).toEqual([
        "Escribe el nombre de la nueva marca.",
      ]);
    }

    const invalidComponent = createProductMutationSchema.safeParse({
      ...baseInput,
      componentTypeId: CUSTOM_CATALOG_VALUE,
      customComponentTypeName: " \t ",
    });
    expect(invalidComponent.success).toBe(false);
    if (!invalidComponent.success) {
      expect(invalidComponent.error.flatten().fieldErrors.customComponentTypeName).toEqual([
        "Escribe el nombre del nuevo tipo de pieza.",
      ]);
    }
  });
});

describe("product serial validation", () => {
  it("trims serials and drops blank secondary values", () => {
    const parsed = createProductMutationSchema.parse({
      ...baseInput,
      primarySerialNumber: "  ABC-123  ",
      secondarySerialNumbers: ["  XYZ-9 ", "   "],
    });

    expect(parsed.primarySerialNumber).toBe("ABC-123");
    expect(parsed.secondarySerialNumbers).toEqual(["XYZ-9"]);
  });

  it.each([
    { primarySerialNumber: "ABC-123", secondarySerialNumbers: [" abc-123 "] },
    { primarySerialNumber: null, secondarySerialNumbers: ["XYZ-9", "xyz-9"] },
  ])("rejects repeated serials within one product", (serials) => {
    const parsed = createProductMutationSchema.safeParse({ ...baseInput, ...serials });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors.secondarySerialNumbers).toBeTruthy();
    }
  });

  it("keeps hyphens and internal spaces significant", () => {
    expect(
      createProductMutationSchema.safeParse({
        ...baseInput,
        primarySerialNumber: "ABC-123",
        secondarySerialNumbers: ["ABC123", "ABC 123"],
      }).success,
    ).toBe(true);
  });
});
